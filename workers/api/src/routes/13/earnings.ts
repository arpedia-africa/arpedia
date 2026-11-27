// Flow 13 · earnings and payouts (docs/prd/13-earnings-payouts.md Server, rules 17–24).
//   GET  /v1/earnings/banks                    author: Nigerian banks for the payout account form
//   POST /v1/earnings/bank-account/resolve     author {bank_code, account_number} → the bank's account name
//   POST /v1/earnings/bank-account             author {bank_code, account_number}: resolve the name at
//        Flutterwave, encrypt the number, score the name against the legal name, submit_bank_account
//   GET  /v1/earnings/flutterwave/balance      Finance / Super admin: NGN balance, feeds prepare_cycle
//   POST /v1/earnings/flutterwave/webhook      transfer events (verif-hash), re-queried by transfer id
// Cron: drainPayouts (every minute) sends queued transfers with the payout reference as idempotency
// key; pollPendingPayouts (hourly) re-queries transfers pending over 48 hours and raises the ones
// still unsettled to Finance; payoutReminder (daily) tells Finance 3 days before payout day about
// unverified accounts and the Flutterwave balance. Finance alerts go through the flow 15 dispatcher.
// Flutterwave has one webhook URL per account, so flow 09's /v1/payments/flutterwave hands
// `transfer.completed` events to handleTransferWebhook as well.
import {
  accountAad,
  flwTransferStatus,
  isAccountNumber,
  nameMatchScore,
  openFile,
  safeEqual,
  sealFile,
  transferEventId,
  type Database,
} from '@arpedia/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { rpcError, userDb } from '../12/http';
import { deliverNotices } from '../15/notify';
import {
  failedAlert,
  reminderAlert,
  retryAlert,
  stuckAlert,
  type PayoutAlert,
  type ReminderDue,
} from './alerts';
import { FlwError, payoutClient, type PayoutClient } from './flutterwave';

type Db = SupabaseClient<Database>;

const earnings = new Hono<AppEnv>();

// ─── Account number encryption (rule 21) ────────────────────────────────────
/** Local stack only, when PAYOUT_ACCOUNT_KEY isn't set: a fixed key, never used on staging or production. */
const LOCAL_KEY = new Uint8Array(32).fill(7);

function accountKey(env: Env): Uint8Array | null {
  if (env.PAYOUT_ACCOUNT_KEY) return Uint8Array.from(atob(env.PAYOUT_ACCOUNT_KEY), (ch) => ch.charCodeAt(0));
  return env.APP_ENV === 'local' ? LOCAL_KEY : null;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

export async function encryptAccount(key: Uint8Array, authorId: string, number: string): Promise<string> {
  // PostgREST takes bytea as \x-prefixed hex.
  return `\\x${toHex(await sealFile(key, new TextEncoder().encode(number), accountAad(authorId)))}`;
}

export async function decryptAccount(key: Uint8Array, authorId: string, b64: string): Promise<string> {
  return new TextDecoder().decode(await openFile(key, fromB64(b64), accountAad(authorId)));
}

// ─── Author: payout account ─────────────────────────────────────────────────
earnings.get('/banks', requireUser, async (c) => {
  const client = payoutClient(c.env);
  if (!client) return c.json({ error: 'not_configured' }, 503);
  const banks = await client.banks();
  c.header('Cache-Control', 'private, max-age=86400');
  return c.json({ banks: banks.sort((a, b) => a.name.localeCompare(b.name)) });
});

const BankBody = z.object({
  bank_code: z.string().trim().min(2).max(10),
  account_number: z.string().trim().refine(isAccountNumber, 'ten digits'),
});

type Resolved =
  | { ok: false; res: Response }
  | { ok: true; bankCode: string; bankName: string; number: string; name: string; legalName: string };

/** Checks the body and the author, then asks the bank for the account name (never the client's). */
async function resolveFor(c: Context<AppEnv>, client: PayoutClient): Promise<Resolved> {
  const body = BankBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return { ok: false, res: c.json({ error: 'bad_request' }, 400) };
  const { bank_code, account_number } = body.data;
  const { data: profile, error } = await serviceDb(c.env)
    .from('author_profiles')
    .select('legal_name')
    .eq('user_id', c.var.user.sub)
    .maybeSingle();
  if (error) throw new Error(`author_profiles: ${error.message}`);
  if (!profile) return { ok: false, res: c.json({ error: 'not_an_author' }, 403) };
  const bank = (await client.banks()).find((b) => b.code === bank_code);
  if (!bank) return { ok: false, res: c.json({ error: 'unknown_bank' }, 400) };
  try {
    const name = await client.resolveAccount(bank_code, account_number, profile.legal_name);
    return {
      ok: true,
      bankCode: bank_code,
      bankName: bank.name,
      number: account_number,
      name,
      legalName: profile.legal_name,
    };
  } catch (e) {
    if (e instanceof FlwError && e.status < 500)
      return { ok: false, res: c.json({ error: 'account_not_found' }, 422) };
    console.error('resolveAccount', e);
    return { ok: false, res: c.json({ error: 'bank_unavailable' }, 502) };
  }
}

/** Step 1: the name the bank holds, shown to the author before saving (rule 21). */
earnings.post('/bank-account/resolve', requireUser, async (c) => {
  const client = payoutClient(c.env);
  if (!client) return c.json({ error: 'not_configured' }, 503);
  const r = await resolveFor(c, client);
  if (!r.ok) return r.res;
  return c.json({ bank_name: r.bankName, account_name: r.name });
});

/** Step 2: resolved again here, encrypted, scored against the legal name and saved. */
earnings.post('/bank-account', requireUser, async (c) => {
  const client = payoutClient(c.env);
  const key = accountKey(c.env);
  if (!client || !key) return c.json({ error: 'not_configured' }, 503);
  const r = await resolveFor(c, client);
  if (!r.ok) return r.res;
  const author = c.var.user.sub;
  const score = nameMatchScore(r.name, r.legalName);
  const { data, error } = await serviceDb(c.env).rpc('submit_bank_account', {
    p_author: author,
    p_bank_code: r.bankCode,
    p_bank_name: r.bankName,
    p_last4: r.number.slice(-4),
    p_number_enc: await encryptAccount(key, author, r.number),
    p_resolved_name: r.name,
    p_match_score: score,
  });
  if (error) return rpcError(c, error);
  return c.json({ ...(data as object), account_name: r.name, match_score: score });
});

// ─── Staff: Flutterwave balance (prepare_cycle) ─────────────────────────────
earnings.get('/flutterwave/balance', requireUser, async (c) => {
  const { data: allowed, error } = await userDb(c).rpc('has_permission', { p_permission: 'release_payouts' });
  if (error) return rpcError(c, error);
  if (!allowed) return c.json({ error: 'forbidden' }, 403);
  const client = payoutClient(c.env);
  if (!client) return c.json({ error: 'not_configured' }, 503);
  return c.json({ balance_kobo: await client.balanceKobo(), at: new Date().toISOString() });
});

// ─── Transfer status (webhook and poll) ─────────────────────────────────────
/**
 * Re-queries one transfer and applies its status. Flutterwave's own answer is trusted, never the
 * webhook body. Duplicates and out-of-order events are absorbed by payout_apply_event.
 */
export async function applyTransfer(db: Db, client: PayoutClient, transferId: string | number) {
  const t = await client.getTransfer(transferId);
  if (!t.reference?.startsWith('ARP-PO-')) return { ignored: 'not a payout' as const };
  const mapped = flwTransferStatus(t.status, t.complete_message);
  if (!mapped) return { ignored: `status ${t.status}` };
  const { data, error } = await db.rpc('payout_apply_event', {
    p_event_id: transferEventId(t.id, mapped.status),
    p_reference: t.reference,
    p_status: mapped.status,
    p_reason:
      mapped.status === 'failed' || mapped.status === 'reversed'
        ? (t.complete_message ?? undefined)
        : undefined,
    p_transient: mapped.transient,
  });
  if (error) throw new Error(`payout_apply_event: ${error.message}`);
  return {
    ...(data as { applied: boolean; replayed?: boolean; retry_id?: string | null }),
    status: mapped.status,
  };
}

interface TransferWebhook {
  event?: string;
  'event.type'?: string;
  data?: { id?: number; reference?: string };
}

export const isTransferEvent = (body: TransferWebhook) =>
  body.event?.startsWith('transfer.') === true || body['event.type'] === 'Transfer';

/** Shared with flow 09's Flutterwave route (one webhook URL per Flutterwave account). */
export async function handleTransferWebhook(env: Env, body: TransferWebhook, client = payoutClient(env)) {
  if (!client) return { status: 503 as const, body: { error: 'not_configured' } };
  if (!body.data?.id) return { status: 200 as const, body: { ok: true, ignored: 'no transfer id' } };
  const res = await applyTransfer(serviceDb(env), client, body.data.id);
  return { status: 200 as const, body: { ok: true, ...res } };
}

earnings.post('/flutterwave/webhook', async (c) => {
  const hash = c.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!hash) return c.json({ error: 'not_configured' }, 503);
  if (!safeEqual(c.req.header('verif-hash') ?? '', hash)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<TransferWebhook>().catch(() => null);
  if (!body) return c.json({ error: 'bad_json' }, 400);
  if (!isTransferEvent(body)) return c.json({ ok: true, ignored: `event ${body.event}` });
  const out = await handleTransferWebhook(c.env, body);
  return c.json(out.body, out.status);
});

// ─── Cron: send queued transfers ────────────────────────────────────────────
interface Sendable {
  send: boolean;
  reason?: string;
  retry_in_s?: number;
  payout_id: string;
  author_id: string;
  reference: string;
  amount_kobo: number;
  bank_code: string;
  account_number_enc: string;
}

type Alert = (a: PayoutAlert) => Promise<unknown>;

/** Hands a Finance alert to the dispatcher; a failed send is logged, never blocks the payout. */
const alertFinance =
  (env: Env, db: Db): Alert =>
  async (a) => {
    const [ok] = await deliverNotices(env, db, [a]).catch(() => [false]);
    if (!ok) console.error('payout_alert not sent', a.alert, a.subject);
  };

/** Returns true when the message is done (ack it). */
export async function sendPayout(
  db: Db,
  client: PayoutClient,
  key: Uint8Array,
  payoutId: string,
  alert: Alert = async () => undefined,
) {
  const { data, error } = await db.rpc('payout_for_transfer', { p_payout: payoutId });
  if (error) throw new Error(`payout_for_transfer: ${error.message}`);
  const p = data as unknown as Sendable;
  // not_yet: release_cycle and retries enqueue with a delay, and so does an account change, so a
  // message read early is left to come back; anything else that can't go is finished.
  if (!p.send) return p.reason !== 'not_yet';

  let created: { id: number; status: string };
  try {
    created = await client.createTransfer({
      reference: p.reference,
      amountKobo: p.amount_kobo,
      bankCode: p.bank_code,
      accountNumber: await decryptAccount(key, p.author_id, p.account_number_enc),
      narration: 'Arpedia author earnings',
    });
  } catch (e) {
    // No transfer exists: the same reference goes again after 1 h, then 6 h, then fails (rule 20).
    console.error('createTransfer', p.reference, e);
    const reason = e instanceof FlwError ? e.message.slice(0, 300) : 'Flutterwave could not be reached';
    const { data: delay, error: eErr } = await db.rpc('payout_transfer_error', {
      p_payout: p.payout_id,
      p_message: reason,
    });
    if (eErr) throw new Error(`payout_transfer_error: ${eErr.message}`, { cause: e });
    // No delay back: that was the third error and the payout is now failed (rule 20).
    if (delay == null) await alert(failedAlert(p.reference, p.amount_kobo, reason));
    else {
      // The run is paused, retrying: Finance hears once per outage (13-11).
      const { data: tell, error: aErr } = await db.rpc('payout_retry_alert', { p_payout: p.payout_id });
      if (aErr) console.error('payout_retry_alert', p.reference, aErr.message);
      else if (tell) await alert(retryAlert(p.reference, reason, delay));
    }
    return false;
  }

  // The money may have moved: record it, retrying here rather than redelivering the message.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error: cErr } = await db.rpc('payout_transfer_created', {
      p_payout: p.payout_id,
      p_transfer_id: String(created.id),
    });
    if (!cErr) break;
    console.error('payout_transfer_created', p.reference, created.id, cErr.message);
  }
  const now = flwTransferStatus(created.status);
  if (now && now.status !== 'pending') await applyTransfer(db, client, created.id);
  return true;
}

export async function drainPayouts(env: Env, client = payoutClient(env)): Promise<void> {
  const key = accountKey(env);
  if (!client || !key) return;
  const db = serviceDb(env);
  // 10 minutes invisible: a slow Flutterwave call never sees the same message twice in flight.
  const { data, error } = await db.rpc('payout_queue_read', { p_vt: 600, p_qty: 10 });
  if (error) {
    console.error('payout_queue_read', error.message);
    return;
  }
  for (const m of (data ?? []) as { msg_id: number; message: { payout_id?: string } }[]) {
    try {
      const done = m.message.payout_id
        ? await sendPayout(db, client, key, m.message.payout_id, alertFinance(env, db))
        : true;
      if (done) await db.rpc('payout_queue_ack', { p_msg_id: m.msg_id });
    } catch (e) {
      console.error('payout_transfer', m.msg_id, e);
    }
  }
}

interface PendingOver {
  reference: string;
  transfer_id: string | null;
  amount_kobo: number;
  newly_raised?: boolean;
}

/**
 * Hourly: transfers pending over 48 hours are re-queried; never retried until Flutterwave says failed.
 * Those still not settled are raised to Finance once (rule 19).
 */
export async function pollPendingPayouts(
  env: Env,
  client = payoutClient(env),
  db: Db = serviceDb(env),
  alert: Alert = alertFinance(env, db),
): Promise<void> {
  if (!client) return;
  const { data, error } = await db.rpc('payouts_pending_over', { p_hours: 48 });
  if (error) {
    console.error('payouts_pending_over', error.message);
    return;
  }
  const stuck: PendingOver[] = [];
  for (const p of (data ?? []) as unknown as PendingOver[]) {
    let settled = false;
    if (p.transfer_id) {
      try {
        const res = await applyTransfer(db, client, p.transfer_id);
        settled = 'status' in res && res.status !== 'pending';
      } catch (e) {
        console.error('poll transfer', p.reference, e);
      }
    }
    if (p.newly_raised && !settled) stuck.push(p);
  }
  if (stuck.length) await alert(stuckAlert(stuck));
}

/**
 * Daily (09:00 Lagos): 3 days before payout day, once per cycle. payout_reminder_due marks the cycle
 * first, so a dispatcher failure loses this one email (logged) rather than sending it twice.
 */
export async function payoutReminder(
  env: Env,
  client = payoutClient(env),
  db: Db = serviceDb(env),
  alert: Alert = alertFinance(env, db),
): Promise<void> {
  const { data, error } = await db.rpc('payout_reminder_due');
  if (error) {
    console.error('payout_reminder_due', error.message);
    return;
  }
  if (!data) return;
  const balance = client ? await client.balanceKobo().catch(() => null) : null;
  await alert(reminderAlert(data as unknown as ReminderDue, balance));
}

export default earnings;
