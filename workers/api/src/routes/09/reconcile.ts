import { parseTxRef, type Json } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import { deliverNotices } from '../15/notify';

// Flow 09 · weekly `store_reconcile` (spec check 09-5). Lists the last 8 days of purchases at
// RevenueCat (Google Play) and Flutterwave (web) and compares them with `transactions`:
//   provider_only  the store took the money but we never recorded it (no credits granted)
//   ours_only      we recorded (and granted) a purchase the store does not list
// Each provider's run is stored by `record_store_reconcile`, which also raises one open
// `credit_alerts` row (kind store_unmatched) per unmatched purchase; Finance gets one email when a
// run raised new ones. Read-only towards the providers: nothing is granted, refunded or retried.
//
// Flutterwave: GET /v3/transactions lists every collection (payout transfers are not in it); only
// charges with our `arp:` tx_ref are ours. RevenueCat has no project-wide list in its v1 API, so we
// read the subscriber of every reader with a Play purchase or a RevenueCat event in the window.
// v1 shows the full history of one-off purchases (top-ups) but only the latest period of a
// subscription, so `ours_only` is checked for Play top-ups only.

const FLW = 'https://api.flutterwave.com/v3';
const RC = 'https://api.revenuecat.com/v1';
const DAY = 86_400_000;
/** Purchases from the last 8 days (a day of overlap with last week's run), ignoring the last hour,
 *  whose webhooks may still be on their way. */
const WINDOW_DAYS = 8;
const SETTLE_MS = 3_600_000;
const MAX_SUBSCRIBERS = 400;
const MAX_FLW_PAGES = 50;

export type Side = 'provider_only' | 'ours_only';
export interface Item {
  side: Side;
  store_txn_id: string;
  user_id?: string | null;
  amount_kobo?: number | null;
  at?: string | null;
  product?: string | null;
}
export interface ProviderTxn {
  id: string;
  at: string;
  user_id?: string | null;
  amount_kobo?: number | null;
  product?: string | null;
}
export interface OurTxn {
  store_txn_id: string;
  user_id: string;
  created_at: string;
  status: string;
  gross_kobo: number;
  kind: string;
  plan_code: string | null;
  topup_code: string | null;
}
export interface Window {
  start: Date;
  end: Date;
}

export function reconcileWindow(now: number): Window {
  return { start: new Date(now - WINDOW_DAYS * DAY), end: new Date(now - SETTLE_MS) };
}

const inWindow = (at: string, w: Window) => {
  const t = Date.parse(at);
  return t >= w.start.getTime() && t < w.end.getTime();
};

/** Statuses of ours that mean money was taken (a pending or failed charge granted nothing). */
const PAID = new Set(['succeeded', 'refunded', 'disputed']);

/**
 * Compare one provider's list with ours. Both lists may reach a day past the window on either side
 * so a purchase recorded a little before or after its store time still matches; only purchases
 * inside the window are reported. `oursOnlyFilter` limits which of our rows the provider can vouch
 * for; `known` is every id the provider lists (defaults to `provider`'s, which may hold only paid ones).
 */
export function diff(
  provider: ProviderTxn[],
  ours: OurTxn[],
  w: Window,
  oursOnlyFilter: (t: OurTxn) => boolean = () => true,
  known: Set<string> = new Set(provider.map((t) => t.id)),
): { items: Item[]; matched: number; providerCount: number; oursCount: number } {
  const ourIds = new Set(ours.map((t) => t.store_txn_id));
  const items: Item[] = [];
  let matched = 0;
  const seen = new Set<string>();
  const theirs = provider.filter((p) => inWindow(p.at, w) && !seen.has(p.id) && seen.add(p.id));
  for (const p of theirs) {
    if (ourIds.has(p.id)) matched++;
    else
      items.push({
        side: 'provider_only',
        store_txn_id: p.id,
        user_id: p.user_id ?? null,
        amount_kobo: p.amount_kobo ?? null,
        at: p.at,
        product: p.product ?? null,
      });
  }
  const mine = ours.filter((t) => PAID.has(t.status) && inWindow(t.created_at, w) && oursOnlyFilter(t));
  for (const t of mine) {
    if (known.has(t.store_txn_id)) continue;
    items.push({
      side: 'ours_only',
      store_txn_id: t.store_txn_id,
      user_id: t.user_id,
      amount_kobo: t.gross_kobo,
      at: t.created_at,
      product: t.plan_code ?? t.topup_code,
    });
  }
  return { items, matched, providerCount: theirs.length, oursCount: mine.length };
}

// ─── Flutterwave ────────────────────────────────────────────────────────────
interface FlwListTx {
  id: number;
  tx_ref?: string;
  amount?: number;
  currency?: string;
  status?: string;
  created_at?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Every Flutterwave collection with our tx_ref from `from` to `to` (whole days), any status. */
export async function flutterwaveList(
  env: Env,
  from: Date,
  to: Date,
  fetcher: typeof fetch = fetch,
): Promise<{ successful: ProviderTxn[]; all: Set<string> }> {
  const successful: ProviderTxn[] = [];
  const all = new Set<string>();
  for (let page = 1; page <= MAX_FLW_PAGES; page++) {
    const res = await fetcher(`${FLW}/transactions?from=${ymd(from)}&to=${ymd(to)}&page=${page}`, {
      headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` },
    });
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      data?: FlwListTx[];
      meta?: { page_info?: { total_pages?: number } };
    } | null;
    if (!res.ok || json?.status !== 'success') throw new Error(`flutterwave transactions: ${res.status}`);
    for (const tx of json.data ?? []) {
      const ref = tx.tx_ref ? parseTxRef(tx.tx_ref) : null;
      if (!ref || !tx.created_at) continue;
      all.add(String(tx.id));
      if (tx.status !== 'successful' || tx.currency !== 'NGN') continue;
      successful.push({
        id: String(tx.id),
        at: new Date(tx.created_at).toISOString(),
        user_id: ref.userId,
        amount_kobo: tx.amount == null ? null : Math.round(tx.amount * 100),
        product: ref.code,
      });
    }
    const pages = json.meta?.page_info?.total_pages ?? 1;
    if (page >= pages) return { successful, all };
  }
  throw new Error(`flutterwave transactions: more than ${MAX_FLW_PAGES} pages`);
}

// ─── RevenueCat ─────────────────────────────────────────────────────────────
interface RcPurchase {
  id?: string;
  purchase_date?: string | null;
  store?: string;
  store_transaction_id?: string | null;
}
interface RcSubscriber {
  subscriber?: {
    subscriptions?: Record<string, RcPurchase>;
    non_subscriptions?: Record<string, RcPurchase[]>;
  };
}

/** Play purchases RevenueCat lists for one reader: every top-up, and each subscription's latest period. */
export function rcPurchases(userId: string, body: RcSubscriber): ProviderTxn[] {
  const out: ProviderTxn[] = [];
  const add = (product: string, p: RcPurchase) => {
    if (p.store !== 'play_store' || !p.store_transaction_id || !p.purchase_date) return;
    out.push({
      id: p.store_transaction_id,
      at: new Date(p.purchase_date).toISOString(),
      user_id: userId,
      product,
    });
  };
  for (const [product, list] of Object.entries(body.subscriber?.non_subscriptions ?? {})) {
    for (const p of list ?? []) add(product, p);
  }
  for (const [product, p] of Object.entries(body.subscriber?.subscriptions ?? {})) if (p) add(product, p);
  return out;
}

async function rcSubscriber(env: Env, userId: string, fetcher: typeof fetch): Promise<RcSubscriber> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetcher(`${RC}/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}` },
    });
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(Number(res.headers.get('Retry-After') ?? '2') || 2, 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`revenuecat subscriber: ${res.status}`);
    return (await res.json()) as RcSubscriber;
  }
}

// ─── The job ────────────────────────────────────────────────────────────────
type Db = ReturnType<typeof serviceDb>;

async function ourTxns(db: Db, store: 'play' | 'web', from: Date, to: Date): Promise<OurTxn[]> {
  const out: OurTxn[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('transactions')
      .select('store_txn_id, user_id, created_at, status, gross_kobo, kind, plan_code, topup_code')
      .eq('store', store)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at')
      .range(offset, offset + 999);
    if (error) throw new Error(`transactions: ${error.message}`);
    out.push(...((data ?? []) as OurTxn[]));
    if ((data ?? []).length < 1000) return out;
  }
}

/** Readers with a RevenueCat webhook in the window (a purchase we failed to record still sent one). */
async function rcEventUsers(db: Db, from: Date, to: Date): Promise<string[]> {
  const { data, error } = await db
    .from('payment_events')
    .select('normalized')
    .eq('provider', 'revenuecat')
    .gte('received_at', from.toISOString())
    .lt('received_at', to.toISOString())
    .limit(5000);
  if (error) throw new Error(`payment_events: ${error.message}`);
  return (data ?? [])
    .map((r) => (r.normalized as { user_id?: unknown } | null)?.user_id)
    .filter((u): u is string => typeof u === 'string');
}

interface RunResult {
  provider: 'revenuecat' | 'flutterwave';
  status: 'ok' | 'failed' | 'skipped';
  providerCount: number;
  oursCount: number;
  matched: number;
  items: Item[];
  error?: string;
}

async function reconcileFlutterwave(env: Env, db: Db, w: Window, fetcher: typeof fetch): Promise<RunResult> {
  const base = { provider: 'flutterwave' as const, providerCount: 0, oursCount: 0, matched: 0, items: [] };
  if (!env.FLUTTERWAVE_SECRET_KEY) return { ...base, status: 'skipped', error: 'not_configured' };
  const wide = { from: new Date(w.start.getTime() - DAY), to: new Date(w.end.getTime() + DAY) };
  const [{ successful, all }, ours] = await Promise.all([
    flutterwaveList(env, wide.from, wide.to, fetcher),
    ourTxns(db, 'web', wide.from, wide.to),
  ]);
  // Flutterwave lists a pending or failed charge too, so our side is checked against every listed
  // id, while only successful charges count as money we must have recorded.
  const d = diff(successful, ours, w, undefined, all);
  return { ...base, status: 'ok', ...d };
}

async function reconcileRevenueCat(env: Env, db: Db, w: Window, fetcher: typeof fetch): Promise<RunResult> {
  const base = { provider: 'revenuecat' as const, providerCount: 0, oursCount: 0, matched: 0, items: [] };
  if (!env.REVENUECAT_API_KEY) return { ...base, status: 'skipped', error: 'not_configured' };
  const wide = { from: new Date(w.start.getTime() - DAY), to: new Date(w.end.getTime() + DAY) };
  const [ours, eventUsers] = await Promise.all([
    ourTxns(db, 'play', wide.from, wide.to),
    rcEventUsers(db, wide.from, wide.to),
  ]);
  const users = [...new Set([...ours.map((t) => t.user_id), ...eventUsers])];
  if (users.length > MAX_SUBSCRIBERS) {
    return { ...base, status: 'failed', error: `too_many_subscribers:${users.length}` };
  }
  const provider: ProviderTxn[] = [];
  for (const u of users) provider.push(...rcPurchases(u, await rcSubscriber(env, u, fetcher)));
  // A renewal we stored may already be replaced by a later period in RevenueCat's v1 answer, so
  // our side is vouched for only where RevenueCat keeps every purchase: top-ups.
  const d = diff(provider, ours, w, (t) => t.kind === 'topup');
  return { ...base, status: 'ok', ...d };
}

async function record(db: Db, w: Window, r: RunResult): Promise<number> {
  const { data, error } = await db.rpc('record_store_reconcile', {
    p_provider: r.provider,
    p_window_start: w.start.toISOString(),
    p_window_end: w.end.toISOString(),
    p_status: r.status,
    p_provider_count: r.providerCount,
    p_ours_count: r.oursCount,
    p_matched: r.matched,
    p_items: r.items as unknown as Json,
    p_error: r.error,
  });
  if (error) throw new Error(`record_store_reconcile: ${error.message}`);
  return (data as { new_alerts?: number } | null)?.new_alerts ?? 0;
}

/** Monday 02:00 UTC (03:00 in Lagos). */
export const isReconcileTime = (scheduledTime: number) => {
  const d = new Date(scheduledTime);
  return d.getUTCDay() === 1 && d.getUTCHours() === 2 && d.getUTCMinutes() === 0;
};

export async function storeReconcile(
  env: Env,
  now: number = Date.now(),
  db: Db = serviceDb(env),
  fetcher: typeof fetch = fetch,
): Promise<RunResult[]> {
  const w = reconcileWindow(now);
  const results: RunResult[] = [];
  let fresh = 0;
  for (const run of [reconcileRevenueCat, reconcileFlutterwave]) {
    let r: RunResult;
    try {
      r = await run(env, db, w, fetcher);
    } catch (e) {
      console.error('[store_reconcile]', e);
      r = {
        provider: run === reconcileRevenueCat ? 'revenuecat' : 'flutterwave',
        status: 'failed',
        providerCount: 0,
        oursCount: 0,
        matched: 0,
        items: [],
        error: String(e instanceof Error ? e.message : e).slice(0, 500),
      };
    }
    fresh += await record(db, w, r);
    results.push(r);
  }
  const failed = results.filter((r) => r.status === 'failed').map((r) => r.provider);
  if (fresh > 0 || failed.length) {
    await deliverNotices(env, db, [
      {
        kind: 'finance_alert',
        alert: fresh > 0 ? 'store_unmatched' : 'store_reconcile_failed',
        count: fresh,
        failed,
      },
    ]);
  }
  return results;
}
