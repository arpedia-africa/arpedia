import { Hono, type Context } from 'hono';
import {
  hasBlockedLink,
  hasPhoneNumber,
  matchMutedWords,
  type MutedWord,
  type WordAction,
} from '@arpedia/core';
import { AuthError, bearer, verifySupabaseJwt } from '@arpedia/core/jwt';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { deliverNotices, type Notice } from '../15/notify';

// Flow 14 · Trust, safety and support.
//   POST /v1/trust/moderate {text, surface, sender_new?, to_author?}  (signed-in user or internal key)
//        → {action: allow | hide | hide_and_report | blur | warn, reason?, hits}
//        The moderate-text check: safety-rule muted words, links, phone numbers. Rules are cached
//        for 60 s and reloaded at once after a change (rules_changed in the outbox).
//   POST /v1/trust/support/inbound   Resend inbound-email webhook (Svix signature) → ticket
//   POST /v1/trust/outbox/drain      (internal key) sends ticket replies by email, acks the rest

type Surface = 'chat' | 'dm' | 'review' | 'comment';
interface Rules {
  words: MutedWord[];
  links: {
    block_new_accounts_days?: number;
    block_dm_links_to_authors?: boolean;
    allowed_domains?: string[];
  };
  spam: { phone_numbers?: string };
  loadedAt: number;
}

const RULES_TTL_MS = 60_000;
let cached: Rules | null = null;

async function rules(env: Env, force = false): Promise<Rules> {
  if (cached && !force && Date.now() - cached.loadedAt < RULES_TTL_MS) return cached;
  const { data, error } = await serviceDb(env).rpc('get_moderation_rules');
  if (error) throw error;
  const r = (data ?? {}) as { words?: MutedWord[]; settings?: Record<string, unknown> };
  cached = {
    words: r.words ?? [],
    links: (r.settings?.links ?? {}) as Rules['links'],
    spam: (r.settings?.spam ?? {}) as Rules['spam'],
    loadedAt: Date.now(),
  };
  return cached;
}

/** Workers call each other with the service key; the app calls with the reader's own token. */
async function authorised(c: Context<AppEnv>): Promise<boolean> {
  const key = c.req.header('X-Internal-Key');
  if (key && timingSafeEqual(key, c.env.SUPABASE_SERVICE_ROLE_KEY)) return true;
  const token = bearer(c.req.header('Authorization'));
  if (!token) return false;
  try {
    await verifySupabaseJwt(token, {
      supabaseUrl: c.env.SUPABASE_URL,
      hsSecret: c.env.APP_ENV === 'local' ? c.env.SUPABASE_JWT_SECRET : undefined,
    });
    return true;
  } catch (e) {
    if (e instanceof AuthError) return false;
    throw e;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const RANK: Record<WordAction, number> = { warn: 0, blur: 1, hide: 2, hide_and_report: 3 };
const stronger = (a: WordAction | null, b: WordAction): WordAction =>
  a === null || RANK[b] > RANK[a] ? b : a;

const trust = new Hono<AppEnv>();

trust.post('/moderate', async (c) => {
  if (!(await authorised(c))) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.slice(0, 4000) : null;
  const surface: Surface = ['chat', 'dm', 'review', 'comment'].includes(body?.surface)
    ? body.surface
    : 'chat';
  if (text === null) return c.json({ error: 'bad_request' }, 400);

  const r = await rules(c.env);
  const { hits, action: wordAction } = matchMutedWords(text, r.words, surface);
  let action: WordAction | null = wordAction;
  let reason: string | undefined = hits.length ? 'muted_word' : undefined;

  const allowed = r.links.allowed_domains ?? ['arpedia.africa'];
  const linkBlocked =
    hasBlockedLink(text, allowed) &&
    ((body?.sender_new === true && (r.links.block_new_accounts_days ?? 7) > 0) ||
      (surface === 'dm' && body?.to_author === true && r.links.block_dm_links_to_authors !== false));
  if (linkBlocked) {
    action = stronger(action, 'hide');
    reason ??= 'link';
  }
  if ((surface === 'chat' || surface === 'dm') && hasPhoneNumber(text) && r.spam.phone_numbers !== 'allow') {
    // Hide and ask the sender to edit (rule 23).
    action = stronger(action, 'hide');
    reason ??= 'phone_number';
  }

  if (hits.length) {
    c.executionCtx.waitUntil(
      Promise.resolve(
        serviceDb(c.env).rpc('record_automod_hits', { p_word_ids: hits.map((h) => h.id) }),
      ).then(() => undefined),
    );
  }
  return c.json({ action: action ?? 'allow', reason, hits: hits.map((h) => h.text) });
});

// ─── Resend inbound email ───────────────────────────────────────────────────
/** Svix signature: base64 HMAC-SHA256 of `${id}.${timestamp}.${body}` with the whsec_ secret. */
export async function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  payload: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${payload}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return headers.signature
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((sig) => timingSafeEqual(sig, expected));
}

const emailOf = (from: unknown): string | null => {
  const s =
    typeof from === 'string'
      ? from
      : typeof (from as { email?: unknown })?.email === 'string'
        ? (from as { email: string }).email
        : '';
  const m = /<([^>]+)>/.exec(s) ?? /([^\s<>]+@[^\s<>]+)/.exec(s);
  return m ? m[1]!.trim().toLowerCase() : null;
};

trust.post('/support/inbound', async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'not_configured' }, 503);
  const payload = await c.req.text();
  const ok = await verifySvix(
    secret,
    {
      id: c.req.header('svix-id') ?? null,
      timestamp: c.req.header('svix-timestamp') ?? null,
      signature: c.req.header('svix-signature') ?? null,
    },
    payload,
  );
  if (!ok) return c.json({ error: 'bad_signature' }, 401);

  const event = JSON.parse(payload) as { type?: string; data?: Record<string, unknown> };
  const d = event.data ?? {};
  const headers = (d.headers ?? {}) as Record<string, string>;
  const from = emailOf(d.from);
  const messageId = String(
    d.message_id ?? headers['message-id'] ?? headers['Message-ID'] ?? c.req.header('svix-id'),
  );
  if (!from) return c.json({ ok: true, ignored: 'no_sender' });

  // Attachments go to R2 under support/; the ticket keeps their keys.
  const files: { key: string; name: string; type: string }[] = [];
  for (const a of (
    (d.attachments ?? []) as { filename?: string; content?: string; content_type?: string }[]
  ).slice(0, 10)) {
    if (!a.content) continue;
    const name = (a.filename ?? 'file').replace(/[^\w.-]+/g, '_').slice(0, 100);
    const key = `support/${crypto.randomUUID()}/${name}`;
    const bytes = Uint8Array.from(atob(a.content), (ch) => ch.charCodeAt(0));
    if (bytes.byteLength > 10 * 1024 * 1024) continue;
    await c.env.BOOKS.put(key, bytes, {
      httpMetadata: { contentType: a.content_type ?? 'application/octet-stream' },
    });
    files.push({ key, name, type: a.content_type ?? 'application/octet-stream' });
  }

  const { data, error } = await serviceDb(c.env).rpc('ingest_support_email', {
    p_from: from,
    p_subject: String(d.subject ?? ''),
    p_body: String(d.text ?? d.html ?? '').slice(0, 20000),
    p_message_id: messageId,
    p_in_reply_to: (d.in_reply_to as string | undefined) ?? headers['in-reply-to'] ?? undefined,
    p_attachments: files,
  });
  if (error) throw error;
  return c.json(data);
});

// ─── Outbox ─────────────────────────────────────────────────────────────────
interface OutboxItem {
  kind: string;
  ticket_id?: string;
  message_id?: string;
  email?: string | null;
  ref?: string;
  subject?: string;
}

async function sendTicketReply(env: Env, item: OutboxItem): Promise<void> {
  if (!item.email || !item.message_id) return;
  const db = serviceDb(env);
  const { data: msg } = await db
    .from('ticket_messages')
    .select('body')
    .eq('id', item.message_id)
    .maybeSingle();
  if (!msg) return;
  if (!env.RESEND_API_KEY) {
    console.log(`[support] reply to ${item.email} on ${item.ref}: ${msg.body.slice(0, 80)}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': item.message_id,
    },
    body: JSON.stringify({
      from: 'Arpedia Support <support@arpedia.africa>',
      to: item.email,
      subject: `Re: [${item.ref}] ${item.subject ?? ''}`.trim(),
      text: msg.body,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

export async function drainTrustOutbox(env: Env): Promise<{ handled: number }> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('trust_queue_read', { p_qty: 20, p_vt: 60 });
  if (error) throw error;
  const done: number[] = [];
  const rows = (data ?? []) as { msg_id: number; message: unknown }[];
  // Pushes and emails for every notice (reporter, sanction, appeal, claims, staff alerts, the
  // ticket-reply push): flow 15's dispatcher. live: pushed by the admin console to the chat Worker.
  const delivered = await deliverNotices(
    env,
    db,
    rows.map((r) => r.message as Notice),
  ).catch((e: unknown) => {
    console.error('[trust outbox] notices', e);
    return rows.map(() => false);
  });
  for (const [i, row] of rows.entries()) {
    const item = row.message as unknown as OutboxItem;
    try {
      if (item.kind === 'ticket_reply') await sendTicketReply(env, item);
      if (item.kind === 'rules_changed') cached = null;
      if (delivered[i]) done.push(row.msg_id);
    } catch (e) {
      console.error('[trust outbox]', item.kind, e);
    }
  }
  if (done.length) {
    const { error: ackError } = await db.rpc('trust_queue_ack', { p_ids: done });
    if (ackError) throw ackError;
  }
  return { handled: done.length };
}

trust.post('/outbox/drain', async (c) => {
  const key = c.req.header('X-Internal-Key');
  if (!key || !timingSafeEqual(key, c.env.SUPABASE_SERVICE_ROLE_KEY))
    return c.json({ error: 'unauthorized' }, 401);
  return c.json(await drainTrustOutbox(c.env));
});

/** Reload the rules now instead of within 60 s. Service key only: a reader can't force reloads. */
trust.post('/rules/refresh', async (c) => {
  const key = c.req.header('X-Internal-Key');
  if (!key || !timingSafeEqual(key, c.env.SUPABASE_SERVICE_ROLE_KEY))
    return c.json({ error: 'unauthorized' }, 401);
  await rules(c.env, true);
  return c.json({ ok: true });
});

export default trust;
