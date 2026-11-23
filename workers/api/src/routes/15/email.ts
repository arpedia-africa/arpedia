// Flow 15 · email-sender and resend-webhook (Server, rule 23). Renders the latest version of a
// system email template and sends it through Resend (logged instead when no key is set locally);
// Resend's signed webhook records opens and bounces for the 30-day numbers.
import { renderTemplate } from '@arpedia/core';
import type { serviceDb } from '../../db';
import type { Env } from '../../env';

type Db = ReturnType<typeof serviceDb>;
const FROM = 'Arpedia <hello@arpedia.africa>';

/** Sender settings from s-emails (email_template_latest carries them). */
export interface Sender {
  from?: string;
  reply_to?: string;
  footer?: string;
}

export interface EmailDraft {
  subject: string;
  preheader: string;
  body: string;
}

interface Latest extends EmailDraft, Sender {
  key: string;
  enabled: boolean;
  version_id: string;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );

/** Plain paragraphs; the preheader sits hidden at the top (inbox preview line). */
function html(d: EmailDraft, footer?: string) {
  const paras = d.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return (
    `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(d.preheader)}</div>` +
    `<div style="font-family:Arial,sans-serif;font-size:16px;color:#1d1a16;max-width:560px">${paras}` +
    (footer ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${escapeHtml(footer)}</p>` : '') +
    `</div>`
  );
}

export function renderEmail(d: EmailDraft, vars: Record<string, string>): EmailDraft {
  return {
    subject: renderTemplate(d.subject, vars),
    preheader: renderTemplate(d.preheader, vars),
    body: renderTemplate(d.body, vars),
  };
}

async function resend(env: Env, to: string, d: EmailDraft, sender: Sender = {}): Promise<string | null> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email] ${to}: ${d.subject}\n${d.body}`);
    return null;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender.from ?? FROM,
      ...(sender.reply_to ? { reply_to: sender.reply_to } : {}),
      to,
      subject: d.subject,
      html: html(d, sender.footer),
      text: sender.footer
        ? `${d.body}

${sender.footer}`
        : d.body,
    }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}`);
  return ((await r.json()) as { id?: string }).id ?? null;
}

/**
 * Send a system email with the newest wording. Switched-off templates are skipped (money and
 * security ones can't be switched off). Returns false when skipped.
 */
export async function sendTemplateEmail(
  env: Env,
  db: Db,
  key: string,
  to: string,
  vars: Record<string, string>,
  userId?: string,
): Promise<boolean> {
  const { data, error } = await db.rpc('email_template_latest', { p_key: key });
  if (error) throw error;
  const t = data as unknown as Latest | null;
  if (!t) throw new Error(`unknown email template ${key}`);
  if (!t.enabled) return false;
  const id = await resend(env, to, renderEmail(t, vars), t);
  const { error: ie } = await db
    .from('email_sends')
    .insert({ template_key: key, version_id: t.version_id, user_id: userId ?? null, resend_id: id });
  if (ie) throw ie;
  return true;
}

/** "Test email" from the editor: the draft as typed, to the signed-in staff address, not logged. */
export async function sendTestEmail(env: Env, to: string, d: EmailDraft, firstName: string) {
  const sample = {
    first_name: firstName,
    amount: '₦4,500',
    plan: 'Reader',
    item: '1,500 credits',
    date: '19 Nov 2026',
  };
  return resend(env, to, renderEmail({ ...d, subject: `[Test] ${d.subject}` }, sample));
}

// ─── Resend webhook (Svix signature) ───────────────────────────────────────

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Svix: base64 HMAC-SHA256 of `${id}.${timestamp}.${body}` with the whsec_ key; 5 minutes leeway. */
export async function verifySvix(
  secret: string,
  headers: Headers,
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigs = headers.get('svix-signature');
  if (!id || !ts || !sigs) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    b64(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const msg = new TextEncoder().encode(`${id}.${ts}.${body}`);
  for (const part of sigs.split(' ')) {
    const [v, sig] = part.split(',');
    if (v !== 'v1' || !sig) continue;
    try {
      if (await crypto.subtle.verify('HMAC', key, b64(sig), msg)) return true;
    } catch {
      // not base64: try the next one
    }
  }
  return false;
}

const EVENT: Record<string, 'opened' | 'bounced'> = { 'email.opened': 'opened', 'email.bounced': 'bounced' };

export async function applyResendEvent(db: Db, payload: { type?: string; data?: { email_id?: string } }) {
  const kind = EVENT[payload.type ?? ''];
  const id = payload.data?.email_id;
  if (!kind || !id) return;
  const { error } = await db.rpc('record_email_event', { p_resend_id: id, p_kind: kind });
  if (error) throw error;
}
