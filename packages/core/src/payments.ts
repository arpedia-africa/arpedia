// Webhook payloads → the normalized event that Postgres applies (ingest_payment_event, flow 09).
// The Workers verify the provider first; these functions only map fields, so replay tests can run
// them without a network.

export type NormalizedType =
  | 'initial_purchase'
  | 'renewal'
  | 'topup'
  | 'cancellation'
  | 'uncancellation'
  | 'expiration'
  | 'billing_issue'
  | 'billing_recovered'
  | 'product_change'
  | 'pause'
  | 'resume'
  | 'refund'
  | 'chargeback';

export interface NormalizedEvent {
  type: NormalizedType;
  user_id: string;
  store: 'play' | 'web' | 'app_store';
  product_id?: string;
  plan_code?: string;
  topup_code?: string;
  new_product_id?: string;
  new_plan_code?: string;
  txn_id?: string;
  original_txn_id?: string;
  period_start?: string;
  period_end?: string;
  gross_kobo?: number;
  fee_kobo?: number;
  refund_kobo?: number;
  pause_until?: string;
  flutterwave_plan_id?: string;
}

export interface IngestInput {
  provider: 'revenuecat' | 'flutterwave';
  eventId: string;
  eventType: string;
  occurredAt: string;
  normalized: NormalizedEvent;
}

/** Events we acknowledge with 200 and do not store (tests, transfers we don't support yet). */
export interface Ignored {
  ignore: string;
}

const iso = (ms: number | null | undefined) => (ms == null ? undefined : new Date(ms).toISOString());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── RevenueCat ─────────────────────────────────────────────────────────────
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id?: string;
  new_product_id?: string | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms: number;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
  takehome_percentage?: number | null;
  store?: string;
  cancel_reason?: string | null;
  auto_resume_at_ms?: number | null;
  environment?: string;
}

const RC_STORE: Record<string, NormalizedEvent['store']> = { PLAY_STORE: 'play', APP_STORE: 'app_store' };

/**
 * Map one RevenueCat webhook body. `app_user_id` is the Supabase user id (the app logs in to
 * RevenueCat with it). Prices arrive in the purchase currency; only NGN carries gross and fee.
 */
export function normalizeRevenueCat(body: { event?: RevenueCatEvent }): IngestInput | Ignored {
  const e = body.event;
  if (!e?.id || !e.type) return { ignore: 'no event' };
  if (e.type === 'TEST') return { ignore: 'test event' };
  const userId = UUID.test(e.app_user_id) ? e.app_user_id : e.original_app_user_id;
  if (!userId || !UUID.test(userId)) return { ignore: 'anonymous app user' };
  const store = RC_STORE[e.store ?? ''];
  if (!store) return { ignore: `store ${e.store}` };

  const money =
    e.currency === 'NGN' && e.price_in_purchased_currency != null
      ? {
          gross_kobo: Math.round(Math.abs(e.price_in_purchased_currency) * 100),
          fee_kobo: Math.round(Math.abs(e.price_in_purchased_currency) * 100 * (1 - (e.takehome_percentage ?? 0.85))),
        }
      : {};
  const base = {
    user_id: userId,
    store,
    product_id: e.product_id,
    txn_id: e.transaction_id ?? undefined,
    original_txn_id: e.original_transaction_id ?? e.transaction_id ?? undefined,
  };
  const out = (type: NormalizedType, extra: Partial<NormalizedEvent> = {}): IngestInput => ({
    provider: 'revenuecat',
    eventId: e.id,
    eventType: e.type,
    occurredAt: iso(e.event_timestamp_ms)!,
    normalized: { type, ...base, ...extra },
  });
  const period = { period_start: iso(e.purchased_at_ms), period_end: iso(e.expiration_at_ms) };

  switch (e.type) {
    case 'INITIAL_PURCHASE':
      return out('initial_purchase', { ...period, ...money });
    case 'RENEWAL':
      return out('renewal', { ...period, ...money });
    case 'NON_RENEWING_PURCHASE':
      return out('topup', money);
    case 'CANCELLATION':
      // A store refund arrives as a cancellation with reason CUSTOMER_SUPPORT.
      return e.cancel_reason === 'CUSTOMER_SUPPORT'
        ? out('refund', { refund_kobo: money.gross_kobo })
        : out('cancellation');
    case 'UNCANCELLATION':
      return out('uncancellation');
    case 'EXPIRATION':
      return out('expiration');
    case 'BILLING_ISSUE':
      return out('billing_issue');
    case 'PRODUCT_CHANGE':
      return out('product_change', { new_product_id: e.new_product_id ?? undefined });
    case 'SUBSCRIPTION_PAUSED':
      return out('pause', { pause_until: iso(e.auto_resume_at_ms) });
    default:
      return { ignore: `type ${e.type}` };
  }
}

// ─── Flutterwave ────────────────────────────────────────────────────────────
/** The verified transaction from GET /v3/transactions/{id}/verify (never the webhook body itself). */
export interface FlutterwaveTx {
  id: number;
  tx_ref: string;
  amount: number;
  currency: string;
  status: string;
  app_fee?: number;
  created_at: string;
  payment_plan?: number | string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Checkout puts our context in the tx_ref: `arp:{kind}:{code}:{user_id}:{nonce}`,
 * kind = plan | topup. Renewals charged by a Flutterwave payment plan keep the plan id; their
 * user and plan come from the subscription the first charge created (`original_txn_id`).
 */
export function parseTxRef(txRef: string) {
  const [prefix, kind, code, userId] = txRef.split(':');
  if (prefix !== 'arp' || (kind !== 'plan' && kind !== 'topup') || !code || !userId || !UUID.test(userId)) {
    return null;
  }
  return { kind, code, userId } as const;
}

/** subscriptions.store_original_txn_id for a reader on a Flutterwave payment plan. */
export const fwSubscriptionKey = (planId: string | number, userId: string) => `fwplan:${planId}:${userId}`;

export function normalizeFlutterwaveCharge(
  tx: FlutterwaveTx,
  opts: { renewal: boolean; months?: number },
): IngestInput | Ignored {
  if (tx.status !== 'successful') return { ignore: `status ${tx.status}` };
  if (tx.currency !== 'NGN') return { ignore: `currency ${tx.currency}` };
  const ref = parseTxRef(tx.tx_ref);
  if (!ref) return { ignore: 'unknown tx_ref' };
  const start = new Date(tx.created_at);
  const money = { gross_kobo: Math.round(tx.amount * 100), fee_kobo: Math.round((tx.app_fee ?? 0) * 100) };
  const base = { user_id: ref.userId, store: 'web' as const, txn_id: String(tx.id) };
  const eventId = `charge:${tx.id}`;
  if (ref.kind === 'topup') {
    return {
      provider: 'flutterwave',
      eventId,
      eventType: 'charge.completed',
      occurredAt: start.toISOString(),
      normalized: { type: 'topup', ...base, topup_code: ref.code, ...money },
    };
  }
  const months = opts.months ?? 1;
  const end = new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth() + months);
  const planId = tx.payment_plan != null ? String(tx.payment_plan) : undefined;
  return {
    provider: 'flutterwave',
    eventId,
    eventType: 'charge.completed',
    occurredAt: start.toISOString(),
    normalized: {
      type: opts.renewal ? 'renewal' : 'initial_purchase',
      ...base,
      plan_code: ref.code,
      // One subscription per reader on a Flutterwave payment plan (a payment plan is shared by every
      // reader on that price); a one-off first charge keys on its tx_ref.
      original_txn_id: planId ? fwSubscriptionKey(planId, ref.userId) : `fwref:${tx.tx_ref}`,
      flutterwave_plan_id: planId,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      ...money,
    },
  };
}

/** Constant-time string compare for shared secrets (webhook auth headers). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
