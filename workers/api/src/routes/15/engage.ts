import { Hono } from 'hono';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { rpcError, userDb } from '../12/http';
import { runCampaigns } from './campaigns';
import { dispatchPushes, releaseHeld } from './dispatcher';
import { applyResendEvent, sendTestEmail, verifySvix } from './email';
import { buildExports, expireExports } from './exports';
import { pollReceipts } from './receipts';

// Flow 15 · Engage and insights.
//   GET  /v1/engage/exports/:id/download   staff: the CSV (creator or Super admin, two-step, unexpired)
//   POST /v1/engage/emails/test            staff: {subject, preheader, body} to the caller's address
//   POST /v1/engage/resend-webhook         Resend opens and bounces (Svix-signed)
// The app calls register_push_token, remove_push_token, push_opened, get_active_banners,
// dismiss_banner and banner_event as RPCs directly; no Worker route is needed for them.

const engage = new Hono<AppEnv>();

engage.get('/exports/:id/download', requireUser, async (c) => {
  const { data: key, error } = await userDb(c).rpc('export_download_key', { p_id: c.req.param('id') });
  if (error) return rpcError(c, error);
  const obj = key ? await c.env.BOOKS.get(key) : null;
  if (!obj) return c.json({ error: 'This file has expired' }, 404);
  const name = key!.split('/').pop()!;
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

engage.post('/emails/test', requireUser, async (c) => {
  const body = await c.req
    .json<{ subject?: string; preheader?: string; body?: string }>()
    .catch(() => ({}) as { subject?: string; preheader?: string; body?: string });
  // Only staff who may see the templates may send a test.
  const { error } = await userDb(c).rpc('staff_list_email_templates');
  if (error) return rpcError(c, error);
  const to = c.var.user.email;
  if (!to) return c.json({ error: 'No email on your account' }, 400);
  const subject = (body.subject ?? '').trim();
  const text = (body.body ?? '').trim();
  if (!subject || !text || subject.length > 120 || text.length > 20000)
    return c.json({ error: 'Add a subject and a message' }, 400);
  const first = to.split('@')[0]!.split(/[._-]/)[0]!;
  await sendTestEmail(
    c.env,
    to,
    { subject, preheader: (body.preheader ?? '').slice(0, 140), body: text },
    first,
  );
  return c.json({ sent_to: to });
});

engage.post('/resend-webhook', async (c) => {
  const raw = await c.req.text();
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    if (c.env.APP_ENV !== 'local') return c.json({ error: 'not_configured' }, 503);
  } else if (!(await verifySvix(secret, c.req.raw.headers, raw))) {
    return c.json({ error: 'bad_signature' }, 401);
  }
  let payload: { type?: string; data?: { email_id?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  await applyResendEvent(serviceDb(c.env), payload);
  return c.json({ ok: true });
});

export default engage;

const settle = async (name: string, p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    console.error(`engage ${name} failed`, e);
  }
};

/** Every minute (api Worker cron). Each job is independent, so one failing doesn't stop the others. */
export async function engageCron(env: Env, scheduledTime: number): Promise<void> {
  const at = new Date(scheduledTime);
  await settle('campaigns', runCampaigns(env));
  await Promise.all([
    settle('dispatch', dispatchPushes(env)),
    settle('held', releaseHeld(env, at)),
    settle('exports', buildExports(env)),
    at.getUTCMinutes() % 5 === 0 ? settle('receipts', pollReceipts(env, at)) : null,
    at.getUTCHours() === 1 && at.getUTCMinutes() === 0 ? settle('expire', expireExports(env)) : null,
    at.getUTCMinutes() % 15 === 10 ? settle('conversions', refreshConversions(env)) : null,
  ]);
}

/** 15-17: unlocks, joins, returns and follows within 24 hours of a campaign push (rule 20). */
export async function refreshConversions(env: Env): Promise<void> {
  const { error } = await serviceDb(env).rpc('refresh_campaign_conversions');
  if (error) throw new Error(error.message);
}
