// Flow 15 · push-dispatcher (Server). Reads pgmq push_fanout, decides per recipient with
// packages/core decidePush (prefs, mutes, blocks, cap, quiet hours, author batching), logs every
// outcome, holds quiet-hour pushes in push_held, and sends the rest through Expo in batches of 100.
// Each push is logged as queued first so it carries its push_log id (the app calls push_opened).
import {
  type Json,
  type PushCategory,
  type PushDecision,
  type PushRecipient,
  type PushTypeRule,
  CAMPAIGN_CHUNK,
  chunks,
  collapseId,
  decidePush,
  previewText,
  releasePlan,
  renderTemplate,
  summaryText,
} from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import { type PushMessage, type PushSender, pushSender } from './sender';

type Db = ReturnType<typeof serviceDb>;

/** What producers put on push_fanout: {type, user_ids, data}. */
export interface FanoutMsg {
  type: string;
  user_ids: string[];
  data?: FanoutData;
}
export interface FanoutData {
  /** Template variables ({{group_name}}, {{sender}}, {{preview}}, {{author}}, {{book_title}}…). */
  vars?: Record<string, string | number>;
  /** Where a tap opens: {kind: book | author | room | group | post | screen, id?, screen?}. */
  target?: { kind: string; id?: string; screen?: string };
  group_id?: string;
  /** Sender, author or other person the push is about (blocks, author batching, feed avatar). */
  actor_id?: string;
  book_id?: string;
  /** club_message: readers mentioned or replied to. */
  mention_ids?: string[];
  /** club_message: readers with this chat open (socket connected). */
  open_ids?: string[];
  // Campaigns (campaign-runner).
  campaign_id?: string;
  variant?: 'a' | 'b';
  title?: string;
  body?: string;
  is_service?: boolean;
  skip_capped?: boolean;
  respect_quiet?: boolean;
}

/** Feed category per push category (flow 02 filters All, Books, Authors, Community). */
const FEED: Record<PushCategory, string> = {
  messages: 'community',
  authors: 'authors',
  reminders: 'books',
  marketing: 'books',
  account: 'account',
};
const CHANNEL: Record<PushCategory, string> = {
  messages: 'messages',
  authors: 'authors',
  reminders: 'reminders',
  marketing: 'offers',
  account: 'account',
};
/** Skips that still leave an item in the in-app feed (push off on the phone, or that push type off). */
const FEED_ON_SKIP = new Set(['no_token', 'pref_off']);

let typeCache: { at: number; rows: Map<string, PushTypeRule> } | null = null;
async function pushTypes(db: Db): Promise<Map<string, PushTypeRule>> {
  if (typeCache && Date.now() - typeCache.at < 60_000) return typeCache.rows;
  const { data, error } = await db
    .from('push_types')
    .select(
      'key, category, enabled, quiet_action, capped, collapse_key, ttl_seconds, title_template, body_template',
    );
  if (error) throw error;
  typeCache = { at: Date.now(), rows: new Map(data.map((t) => [t.key, t as PushTypeRule])) };
  return typeCache.rows;
}

/** The rendered push, the same for every recipient of one queue message. */
function content(type: PushTypeRule, d: FanoutData) {
  const vars = { ...d.vars };
  if (typeof vars.preview === 'string') vars.preview = previewText(vars.preview);
  const title = d.title ?? renderTemplate(type.title_template, vars);
  const body = d.body ?? renderTemplate(type.body_template, vars);
  const target = d.target ?? { kind: 'screen', screen: 'home' };
  const collapse = collapseId(type, d.group_id ?? target.id ?? null);
  return { title, body, target, collapse };
}

interface Outgoing {
  user_id: string;
  tokens: string[];
  type: PushTypeRule;
  title: string;
  body: string;
  data: Record<string, unknown>;
  log: Record<string, unknown>;
}

/** Log as queued, send to every device, then mark sent or failed. Dead tokens are disabled. */
export async function sendAll(
  db: Db,
  sender: PushSender,
  out: Outgoing[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const part of chunks(out, 500)) {
    const { data: ids, error } = await db.rpc('log_pushes', {
      p_rows: part.map((o) => ({ ...o.log, status: 'queued' })) as unknown as Json,
    });
    if (error) throw error;
    const messages: (PushMessage & { idx: number })[] = [];
    part.forEach((o, idx) => {
      for (const to of o.tokens)
        messages.push({
          idx,
          to,
          title: o.title,
          body: o.body,
          data: { ...o.data, push_id: ids[idx] },
          ttl: o.type.ttl_seconds,
          priority: o.type.category === 'messages' || o.type.category === 'account' ? 'high' : 'default',
          channelId: CHANNEL[o.type.category],
        });
    });
    let tickets: Awaited<ReturnType<PushSender['send']>>;
    try {
      tickets = await sender.send(messages.map(({ idx: _, ...m }) => m));
    } catch (e) {
      console.error('push send failed', e);
      tickets = messages.map(() => ({ ok: false as const, error: 'send_failed' }));
    }
    const per = part.map(() => ({
      ticket_ids: [] as string[],
      ticket_tokens: {} as Record<string, string>,
      err: '',
    }));
    const dead: string[] = [];
    tickets.forEach((t, i) => {
      const m = messages[i]!;
      const p = per[m.idx]!;
      if (t.ok) {
        p.ticket_ids.push(t.id);
        p.ticket_tokens[t.id] = m.to;
      } else {
        p.err = t.error;
        if (t.error === 'DeviceNotRegistered') dead.push(m.to);
      }
    });
    if (dead.length) await db.rpc('disable_push_tokens', { p_tokens: dead });
    const rows = per.map((p, i) => {
      const ok = p.ticket_ids.length > 0;
      if (ok) sent++;
      else failed++;
      return ok
        ? { id: ids[i], status: 'sent', ticket_ids: p.ticket_ids, ticket_tokens: p.ticket_tokens }
        : { id: ids[i], status: 'failed', error: p.err || 'no_device' };
    });
    const { error: me } = await db.rpc('mark_pushes_sent', { p_rows: rows as unknown as Json });
    if (me) throw me;
  }
  return { sent, failed };
}

/** Decide, hold and send one queue message. Returns counts for the campaign runner's numbers. */
export async function fanOut(db: Db, sender: PushSender, msg: FanoutMsg, at = new Date()) {
  const types = await pushTypes(db);
  const type = types.get(msg.type);
  if (!type) throw new Error(`unknown push type ${msg.type}`);
  const d = msg.data ?? {};
  const c = content(type, d);
  const mentions = new Set(d.mention_ids ?? []);
  const open = new Set(d.open_ids ?? []);
  const counts = { sent: 0, failed: 0, held: 0, skipped: 0, skipped_cap: 0 };
  const isCampaign = type.key === 'campaign';
  const authorId = type.category === 'authors' ? d.actor_id : undefined;
  const baseData = {
    type: type.key,
    target: c.target,
    collapse: c.collapse,
    ...(d.campaign_id ? { campaign_id: d.campaign_id } : {}),
  };
  const feed = isCampaign
    ? undefined
    : {
        kind: type.key,
        category: FEED[type.category],
        title: c.title,
        body: c.body,
        target_type: c.target.kind,
        target_id: c.target.id ?? c.target.screen ?? null,
        actor_id: d.actor_id ?? null,
        book_id: d.book_id ?? null,
      };

  for (const ids of chunks([...new Set(msg.user_ids)], CAMPAIGN_CHUNK)) {
    const { data: recips, error } = await db.rpc('push_recipients', {
      p_user_ids: ids,
      p_type: type.key,
      p_group: d.group_id,
      p_actor: d.actor_id,
      p_at: at.toISOString(),
    });
    if (error) throw error;
    const out: Outgoing[] = [];
    const logged: Record<string, unknown>[] = [];
    for (const r of recips as unknown as PushRecipient[]) {
      const decision: PushDecision = decidePush(type, r, {
        at,
        isService: d.is_service,
        skipCapped: d.skip_capped,
        respectQuiet: d.respect_quiet,
        mentioned: mentions.has(r.user_id),
        chatOpen: open.has(r.user_id),
      });
      const log = {
        user_id: r.user_id,
        type: type.key,
        campaign_id: d.campaign_id,
        variant: d.variant,
        collapse_key: c.collapse,
        data: baseData,
        author_id: authorId,
      };
      if (decision.action === 'send') {
        out.push({
          user_id: r.user_id,
          tokens: r.tokens,
          type,
          title: c.title,
          body: c.body,
          data: baseData,
          log: { ...log, feed },
        });
      } else if (decision.action === 'hold') {
        counts.held++;
        logged.push({ ...log, status: 'skipped_quiet', skip_reason: 'held', feed });
        const { error: he } = await db.rpc('hold_push', {
          p_user: r.user_id,
          p_type: type.key,
          p_payload: { title: c.title, body: c.body, data: baseData, log } as unknown as Json,
          p_release_at: decision.releaseAt.toISOString(),
          p_drop_if_older: decision.dropIfOlder,
        });
        if (he) throw he;
      } else {
        if (decision.status === 'skipped_cap') counts.skipped_cap++;
        else counts.skipped++;
        logged.push({
          ...log,
          status: decision.status,
          skip_reason: decision.reason,
          ...(FEED_ON_SKIP.has(decision.reason) && feed ? { feed } : {}),
        });
      }
    }
    for (const part of chunks(logged, 500)) {
      const { error: le } = await db.rpc('log_pushes', { p_rows: part as unknown as Json });
      if (le) throw le;
    }
    const s = await sendAll(db, sender, out);
    counts.sent += s.sent;
    counts.failed += s.failed;
  }
  return counts;
}

/** Drain push_fanout. A message that keeps failing is dropped after 5 reads. */
export async function dispatchPushes(env: Env, budgetMs = 40_000): Promise<void> {
  const db = serviceDb(env);
  const sender = pushSender(env);
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    const { data, error } = await db.rpc('engage_queue_read', {
      p_queue: 'push_fanout',
      p_vt: 120,
      p_qty: 10,
    });
    if (error) throw error;
    const msgs = (data ?? []) as unknown as { msg_id: number; read_ct: number; message: FanoutMsg }[];
    if (!msgs.length) return;
    for (const m of msgs) {
      try {
        if (m.read_ct <= 5) await fanOut(db, sender, m.message);
        else console.error('push message dropped after 5 tries', m.message.type);
        await db.rpc('engage_queue_done', { p_queue: 'push_fanout', p_msg_id: m.msg_id });
      } catch (e) {
        console.error('push fan-out failed', m.message.type, e);
      }
    }
  }
}

interface HeldPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  log: Record<string, unknown>;
}

/** Quiet hours over: send what was held (more than 3 messages fold into one summary). */
export async function releaseHeld(env: Env, now = new Date()): Promise<void> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('take_held_pushes', { p_limit: 500 });
  if (error) throw error;
  if (!data.length) return;
  const types = await pushTypes(db);
  const byUser = new Map<
    string,
    { type: PushTypeRule; payload: HeldPayload; category: PushCategory; held_at: Date }[]
  >();
  for (const h of data) {
    const type = types.get(h.type);
    if (!type) continue;
    const list = byUser.get(h.user_id) ?? [];
    list.push({
      type,
      payload: h.payload as unknown as HeldPayload,
      category: type.category,
      held_at: new Date(h.held_at),
    });
    byUser.set(h.user_id, list);
  }
  const { data: devs, error: de } = await db
    .from('user_devices')
    .select('user_id, push_token')
    .in('user_id', [...byUser.keys()])
    .not('push_token', 'is', null)
    .is('revoked_at', null)
    .is('push_disabled_at', null);
  if (de) throw de;
  const tokens = new Map<string, string[]>();
  for (const d of devs) tokens.set(d.user_id, [...(tokens.get(d.user_id) ?? []), d.push_token!]);

  const out: Outgoing[] = [];
  for (const [user, held] of byUser) {
    const t = tokens.get(user) ?? [];
    if (!t.length) continue;
    const plan = releasePlan(held, now);
    for (const h of plan.send)
      out.push({ user_id: user, tokens: t, type: h.type, ...h.payload, log: h.payload.log });
    if (plan.summary.length) {
      const first = plan.summary[0]!;
      const data = {
        type: first.type.key,
        target: { kind: 'screen', screen: 'community' },
        collapse: 'summary',
      };
      out.push({
        user_id: user,
        tokens: t,
        type: first.type,
        title: 'Arpedia',
        body: summaryText(plan.summary.length),
        data,
        log: {
          user_id: user,
          type: first.type.key,
          collapse_key: 'summary',
          data: { ...data, count: plan.summary.length },
        },
      });
    }
  }
  await sendAll(db, pushSender(env), out);
}
