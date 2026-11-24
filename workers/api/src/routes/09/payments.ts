import { Hono } from 'hono';
import {
  fwSubscriptionKey,
  normalizeFlutterwaveCharge,
  normalizeRevenueCat,
  safeEqual,
  type FlutterwaveTx,
  type IngestInput,
  type Ignored,
  type Json,
} from '@arpedia/core';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { handleTransferWebhook, isTransferEvent } from '../13/earnings';

// Flow 09 · payment webhooks and outbound provider calls.
//   POST /v1/payments/revenuecat   RevenueCat webhook (Authorization header = shared secret)
//   POST /v1/payments/flutterwave  Flutterwave webhook (verif-hash header), re-queried by transaction id
// Both store the event and apply it in one call (`ingest_payment_event`). A known duplicate answers
// 200 and changes nothing; a failure answers 500 so the provider retries.
// `drainPayments` (cron) works the `payments_out` queue: Flutterwave refunds, plan cancel/resume,
// RevenueCat promotional days, Finance alerts.

const FLW = 'https://api.flutterwave.com/v3';
const RC = 'https://api.revenuecat.com/v1';

type Db = ReturnType<typeof serviceDb>;

const payments = new Hono<AppEnv>();

async function ingest(db: Db, input: IngestInput, payload: unknown) {
  const { data, error } = await db.rpc('ingest_payment_event', {
    p_provider: input.provider,
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_occurred_at: input.occurredAt,
    p_payload: payload as Json,
    p_normalized: input.normalized as unknown as Json,
  });
  if (error) throw new Error(`ingest_payment_event: ${error.message}`);
  return data as { id: number; duplicate?: boolean; outcome?: string; error?: string };
}

const isIgnored = (r: IngestInput | Ignored): r is Ignored => 'ignore' in r;

/** The lowest web price (kobo) a plan has had, or a top-up's price; null when the code is unknown. */
async function lowestPriceKobo(db: Db, kind: 'plan' | 'topup', code: string): Promise<number | null> {
  if (kind === 'topup') {
    const { data } = await db.from('topup_products').select('price_kobo').eq('code', code).maybeSingle();
    return data?.price_kobo ?? null;
  }
  const { data } = await db.from('plan_price_versions').select('price_web_kobo').eq('plan_code', code);
  const prices = (data ?? []).map((r) => r.price_web_kobo).filter((p): p is number => p != null);
  return prices.length ? Math.min(...prices) : null;
}

payments.post('/revenuecat', async (c) => {
  const secret = c.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret) return c.json({ error: 'not_configured' }, 503);
  if (!safeEqual(c.req.header('Authorization') ?? '', secret)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req
    .json<{ event?: Parameters<typeof normalizeRevenueCat>[0]['event'] }>()
    .catch(() => null);
  if (!body) return c.json({ error: 'bad_json' }, 400);
  const mapped = normalizeRevenueCat(body);
  if (isIgnored(mapped)) return c.json({ ok: true, ignored: mapped.ignore });
  const res = await ingest(serviceDb(c.env), mapped, body);
  if (res.error) return c.json({ error: 'apply_failed', id: res.id }, 500);
  return c.json({ ok: true, duplicate: res.duplicate ?? false, outcome: res.outcome });
});

// Local test store (flow 17 whole-app check): until the RevenueCat SDK lands, a local build
// (EXPO_PUBLIC_TEST_STORE) "buys" through here. It builds the event Google Play + RevenueCat would
// send and applies it through the same normalise + ingest path as the webhook. Never on staging or
// production: anything but APP_ENV local answers 404.
payments.post('/test-store', requireUser, async (c) => {
  if (c.env.APP_ENV !== 'local') return c.json({ error: 'not_found' }, 404);
  const body = await c.req
    .json<{ kind?: unknown; code?: unknown }>()
    .catch(() => ({}) as Record<string, unknown>);
  const kind = body.kind === 'plan' || body.kind === 'topup' ? body.kind : null;
  const code = typeof body.code === 'string' ? body.code : '';
  if (!kind || !code) return c.json({ error: 'bad_request' }, 400);
  const db = serviceDb(c.env);
  const { data: product } = await db
    .from(kind === 'plan' ? 'plans' : 'topup_products')
    .select('play_product_id')
    .eq('code', code)
    .maybeSingle();
  const kobo = await lowestPriceKobo(db, kind, code);
  if (!product || kobo == null) return c.json({ error: 'unknown_product' }, 404);
  const now = Date.now();
  const txn = `GPA.test-${crypto.randomUUID()}`;
  const event = {
    id: crypto.randomUUID(),
    type: kind === 'plan' ? 'INITIAL_PURCHASE' : 'NON_RENEWING_PURCHASE',
    app_user_id: c.get('user').sub!,
    product_id: product.play_product_id,
    transaction_id: txn,
    original_transaction_id: txn,
    purchased_at_ms: now,
    expiration_at_ms: kind === 'plan' ? now + 30 * 86_400_000 : null,
    event_timestamp_ms: now,
    price_in_purchased_currency: kobo / 100,
    currency: 'NGN',
    store: 'PLAY_STORE',
    environment: 'SANDBOX',
  };
  const mapped = normalizeRevenueCat({ event });
  if (isIgnored(mapped)) return c.json({ error: 'ignored', reason: mapped.ignore }, 400);
  const res = await ingest(db, mapped, { event });
  if (res.error) return c.json({ error: 'apply_failed', id: res.id }, 500);
  return c.json({ ok: true, outcome: res.outcome });
});

/** A Flutterwave answer that wasn't a success; 4xx is final, 5xx may pass on a retry. */
class FlwError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function flw<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${FLW}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const json = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: T } | null;
  if (!res.ok || json?.status !== 'success') {
    throw new FlwError(res.status, `flutterwave ${path}: ${res.status} ${json?.message ?? ''}`);
  }
  return json.data as T;
}

interface FlwWebhook {
  event?: string;
  'event.type'?: string;
  data?: { id?: number; tx_ref?: string; plan?: number; status?: string; customer?: { email?: string } };
}

payments.post('/flutterwave', async (c) => {
  const hash = c.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!hash || !c.env.FLUTTERWAVE_SECRET_KEY) return c.json({ error: 'not_configured' }, 503);
  if (!safeEqual(c.req.header('verif-hash') ?? '', hash)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<FlwWebhook>().catch(() => null);
  // One webhook URL per Flutterwave account: author payout transfers are flow 13's to apply.
  if (body && isTransferEvent(body)) {
    const out = await handleTransferWebhook(c.env, body);
    return c.json(out.body, out.status);
  }
  if (!body?.event || !body.data) return c.json({ error: 'bad_json' }, 400);
  const db = serviceDb(c.env);

  if (body.event === 'charge.completed' && body.data.id) {
    // Trust only Flutterwave's own answer for this transaction id, never the webhook body.
    const tx = await flw<FlutterwaveTx>(c.env, `/transactions/${body.data.id}/verify`);
    const { data: plans } = await db.rpc('get_plans');
    const code = tx.tx_ref.split(':')[2];
    const plan = ((plans as { plans?: { code: string; months: number }[] } | null)?.plans ?? []).find(
      (p) => p.code === code,
    );
    const mapped = normalizeFlutterwaveCharge(tx, { renewal: tx.payment_plan != null, months: plan?.months });
    if (isIgnored(mapped)) return c.json({ ok: true, ignored: mapped.ignore });
    // tx_ref is written by the checkout, so never grant more than was paid for: the charge must
    // cover the lowest web price this plan or top-up has had (older prices cover readers who keep
    // their price until renewal).
    const floor = await lowestPriceKobo(
      db,
      mapped.normalized.topup_code ? 'topup' : 'plan',
      mapped.normalized.topup_code ?? code ?? '',
    );
    if (floor == null || (mapped.normalized.gross_kobo ?? 0) < floor) {
      console.warn('flutterwave charge below price', tx.id, tx.tx_ref, mapped.normalized.gross_kobo, floor);
      return c.json({ ok: true, ignored: 'amount below price' });
    }
    const res = await ingest(db, mapped, { webhook: body, verified: tx });
    if (res.error) return c.json({ error: 'apply_failed', id: res.id }, 500);
    return c.json({ ok: true, duplicate: res.duplicate ?? false, outcome: res.outcome });
  }

  if (body.event === 'charge.dispute' || body['event.type'] === 'CHARGEBACK') {
    // Chargeback: treated like a full refund (clawback, subscription ended, Finance alerted).
    const tx = body.data.id ? await flw<FlutterwaveTx>(c.env, `/transactions/${body.data.id}/verify`) : null;
    if (!tx) return c.json({ ok: true, ignored: 'no transaction' });
    const userId = tx.tx_ref.split(':')[3];
    if (!userId) return c.json({ ok: true, ignored: 'unknown tx_ref' });
    const res = await ingest(
      db,
      {
        provider: 'flutterwave',
        eventId: `chargeback:${tx.id}`,
        eventType: body.event,
        occurredAt: new Date().toISOString(),
        normalized: { type: 'chargeback', user_id: userId, store: 'web', txn_id: String(tx.id) },
      },
      body,
    );
    if (res.error) return c.json({ error: 'apply_failed', id: res.id }, 500);
    return c.json({ ok: true, duplicate: res.duplicate ?? false, outcome: res.outcome });
  }

  if (body.event === 'subscription.cancelled' && body.data.plan) {
    const email = body.data.customer?.email;
    const { data: userId } = email
      ? await db.rpc('worker_user_by_email', { p_email: email })
      : { data: null };
    if (!userId) return c.json({ ok: true, ignored: 'unknown customer' });
    const res = await ingest(
      db,
      {
        provider: 'flutterwave',
        // Without a subscription id, key on arrival time: a later cancellation on the same plan must
        // not be dropped as a duplicate (applying a cancellation twice changes nothing).
        eventId: `subcancel:${body.data.id ?? `${body.data.plan}:${Date.now()}`}:${userId}`,
        eventType: body.event,
        occurredAt: new Date().toISOString(),
        normalized: {
          type: 'cancellation',
          user_id: userId as string,
          store: 'web',
          original_txn_id: fwSubscriptionKey(body.data.plan, userId as string),
        },
      },
      body,
    );
    if (res.error) return c.json({ error: 'apply_failed', id: res.id }, 500);
    return c.json({ ok: true, duplicate: res.duplicate ?? false, outcome: res.outcome });
  }

  // Refunds we start ourselves are completed by the queue drain (complete_refund), so the
  // refund webhook is only acknowledged here.
  return c.json({ ok: true, ignored: `event ${body.event}` });
});

// ─── Outbound queue ─────────────────────────────────────────────────────────
type OutMsg =
  | { kind: 'flutterwave_refund'; refund_request_id: string; store_txn_id: string; amount_kobo: number }
  | { kind: 'flutterwave_cancel_plan'; subscription_id: string }
  | { kind: 'flutterwave_resume_charge'; subscription_id: string }
  | { kind: 'revenuecat_promo_grant'; subscription_id: string; user_id: string; days: number }
  | { kind: 'finance_alert'; alert: string; transaction_id: string };

interface SubInfo {
  id: string;
  user_id: string;
  email: string | null;
  flutterwave_plan_id: string | null;
}

/** RevenueCat promotional durations for the 7, 14 and 30 day extensions (rule 33). */
const RC_DURATION: Record<number, string> = { 7: 'weekly', 14: 'two_week', 30: 'monthly' };

async function flwSubscriptionId(env: Env, sub: SubInfo) {
  if (!sub.flutterwave_plan_id || !sub.email) return null;
  const list = await flw<{ id: number; status: string }[]>(
    env,
    `/subscriptions?plan=${encodeURIComponent(sub.flutterwave_plan_id)}&email=${encodeURIComponent(sub.email)}`,
  );
  return list[0]?.id ?? null;
}

/** Returns true when the message is done (ack it), false to retry after the visibility timeout. */
async function handle(env: Env, db: Db, msg: OutMsg): Promise<boolean> {
  const sub = async (id: string) => {
    const { data, error } = await db.rpc('worker_payment_subscription', { p_sub: id });
    if (error) throw new Error(`worker_payment_subscription: ${error.message}`);
    return data as unknown as SubInfo | null;
  };

  switch (msg.kind) {
    case 'flutterwave_refund': {
      if (!env.FLUTTERWAVE_SECRET_KEY) return false;
      // A redelivered message must never refund twice: only a request still marked refunding is sent.
      const { data: req, error: readErr } = await db
        .from('refund_requests')
        .select('status, flutterwave_refund_id')
        .eq('id', msg.refund_request_id)
        .maybeSingle();
      if (readErr) throw new Error(`refund_requests: ${readErr.message}`);
      if (!req || req.status !== 'refunding' || req.flutterwave_refund_id) return true;
      let ok = true;
      let refundId: string | null = null;
      try {
        const r = await flw<{ id: number }>(env, `/transactions/${msg.store_txn_id}/refund`, {
          method: 'POST',
          body: JSON.stringify({ amount: msg.amount_kobo / 100 }),
        });
        refundId = String(r.id);
      } catch (e) {
        console.error(e);
        // Network errors and 5xx: try again after the visibility timeout. 4xx: Flutterwave said no.
        if (!(e instanceof FlwError) || e.status >= 500) return false;
        ok = false;
      }
      // The money has moved (or was refused): record it, retrying here rather than redelivering the
      // message, which would send the refund again. If it still fails, the request stays
      // "refunding" in admin for Finance to complete by hand.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await db.rpc('complete_refund', {
          p_request: msg.refund_request_id,
          p_ok: ok,
          p_flutterwave_refund_id: refundId ?? undefined,
        });
        if (!error) return true;
        console.error('complete_refund', msg.refund_request_id, refundId, error.message);
      }
      return true;
    }
    case 'flutterwave_cancel_plan':
    case 'flutterwave_resume_charge': {
      if (!env.FLUTTERWAVE_SECRET_KEY) return false;
      const s = await sub(msg.subscription_id);
      if (!s) return true;
      const fwId = await flwSubscriptionId(env, s);
      if (!fwId) return true;
      const action = msg.kind === 'flutterwave_cancel_plan' ? 'cancel' : 'activate';
      await flw(env, `/subscriptions/${fwId}/${action}`, { method: 'PUT' });
      return true;
    }
    case 'revenuecat_promo_grant': {
      if (!env.REVENUECAT_API_KEY) return false;
      const duration = RC_DURATION[msg.days];
      if (!duration) return true;
      const entitlement = env.REVENUECAT_ENTITLEMENT ?? 'premium';
      const res = await fetch(
        `${RC}/subscribers/${encodeURIComponent(msg.user_id)}/entitlements/${entitlement}/promotional`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration }),
        },
      );
      if (!res.ok) throw new Error(`revenuecat promotional: ${res.status}`);
      return true;
    }
    case 'finance_alert':
      // Shown in admin Credits anomalies (credit_alerts); email to Finance arrives with flow 15.
      console.warn('finance_alert', msg.alert, msg.transaction_id);
      return true;
    default:
      return true;
  }
}

export async function drainPayments(env: Env): Promise<void> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('payments_queue_read', { p_vt: 300, p_qty: 10 });
  if (error) {
    console.error('payments_queue_read', error.message);
    return;
  }
  for (const m of (data ?? []) as { msg_id: number; message: unknown }[]) {
    try {
      if (await handle(env, db, m.message as OutMsg)) {
        await db.rpc('payments_queue_ack', { p_msg_id: m.msg_id });
      }
    } catch (e) {
      // Left on the queue; it comes back after the visibility timeout.
      console.error('payments_out', m.msg_id, e);
    }
  }
}

export default payments;
