import { useMemo, useSyncExternalStore } from 'react';
import { onlineManager, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import {
  AVG_BOOK_PRICE,
  LAUNCH_PLANS,
  TIP_PRESETS,
  TOPUP_PACKS,
  ledgerDay,
  naira,
  type Plan,
  type TopupPack,
} from '@arpedia/core';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { productKey, storePrices, type StorePrice } from './purchases';

// Reader RPCs of flow 09 (supabase/migrations/20261120000000_09_credits.sql). Every credit movement
// happens on the server; the app only reads balances and asks for pause, resume and promo codes.

export type PlanCode = 'monthly' | 'quarterly' | 'yearly';
export type SubStatus =
  'active' | 'grace' | 'billing_retry' | 'paused' | 'cancelled' | 'expired' | 'refunded';

export interface BalanceJson {
  total: number;
  plan: number;
  rollover: number;
  topup: number;
  promo: number;
  books: number;
  plan_expires_at: string | null;
  rollover_expires_at: string | null;
  updated_at: string;
}

export interface PlanJson {
  code: PlanCode;
  name: string;
  months: number;
  credits: number;
  bonus_credits: number;
  total_credits: number;
  price_play_kobo: number;
  price_web_kobo: number;
  play_product_id: string | null;
  /** Google Play's own price text (screens fall back to `price_play_kobo` without a store). */
  price_text?: string;
  /** Google Play's per-month text, when it gives one. */
  month_text?: string | null;
  badge: string | null;
  active: boolean;
  sort: number;
}

export interface TopupJson {
  code: string;
  credits: number;
  price_kobo: number;
  play_product_id: string | null;
  /** Google Play's own price text (screens fall back to `price_kobo` without a store). */
  price_text?: string;
}

export interface PlansJson {
  plans: PlanJson[];
  topups: TopupJson[];
  avg_book_price_credits: number;
  credit_value_kobo: number;
}

export interface SubscriptionJson {
  id: string;
  plan: PlanJson;
  status: SubStatus;
  store: 'play' | 'web';
  auto_renew: boolean;
  period_start: string;
  period_end: string;
  pause_until: string | null;
  pending_plan: PlanJson | null;
  price_kobo: number;
}

export interface PlanScreenJson {
  subscription: SubscriptionJson | null;
  balance: BalanceJson;
  pause_max_months: number;
  plans: PlanJson[];
}

export type PlanStateJson =
  { state: 'none' } | { state: 'plan'; status: SubStatus; plan_code: PlanCode; period_end: string };

export interface HistoryItem {
  id: number;
  reason: string;
  delta: number;
  at: string;
  chapter_uid: string | null;
  chapter: string | null;
}

export interface HistoryLine {
  /** 'book_chapters' (pay-as-you-read, grouped per book) or a ledger reason. */
  kind: string;
  key: string;
  at: string;
  delta: number;
  title: string | null;
  detail: {
    book_id?: string;
    note?: string;
    ref_id?: string;
    counterparty?: string;
    paid?: number;
    price?: number | null;
    items?: HistoryItem[];
  };
}

export interface CreditsScreenJson {
  balance: BalanceJson;
  plan: PlanStateJson;
  history: HistoryLine[];
  topups: TopupJson[];
  tip_presets: number[];
  message_cost: number;
  gift_min: number;
}

export const creditsKey = ['credits-screen'] as const;
export const planScreenKey = ['plan-screen'] as const;
export const plansKey = ['plans'] as const;
export const balanceKey = ['credit-balance'] as const;

const PAGE = 50;

/** What Google Play charges for a plan, in its own words. */
export const planPrice = (p: PlanJson) => p.price_text ?? naira(p.price_play_kobo);
/** The per-month figure: Google Play's own when it gives one. */
export const planPerMonth = (p: PlanJson) => p.month_text ?? naira(Math.round(p.price_play_kobo / p.months));
/** What Google Play charges for a credit pack. */
export const packPrice = (t: TopupJson) => t.price_text ?? naira(t.price_kobo);

/**
 * Put Google Play's own price text on plans and packs. The queries wait for it, so the screens
 * keep their skeleton prices until the store answers (States: Loading).
 */
function priced<T extends { plans?: PlanJson[]; topups?: TopupJson[] }>(
  json: T,
  prices: Record<string, StorePrice>,
): T {
  const plan = (p: PlanJson): PlanJson => {
    const sp = prices[productKey({ kind: 'plan', code: p.code })];
    return sp ? { ...p, price_text: sp.text, month_text: sp.monthText } : p;
  };
  const pack = (t: TopupJson): TopupJson => {
    const sp = prices[productKey({ kind: 'topup', code: t.code })];
    return sp ? { ...t, price_text: sp.text } : t;
  };
  return {
    ...json,
    ...(json.plans ? { plans: json.plans.map(plan) } : {}),
    ...(json.topups ? { topups: json.topups.map(pack) } : {}),
  };
}

/** Server error code (`raise exception '<code>'`). */
export const errCode = (e: unknown) => (e as { message?: string } | null)?.message ?? 'unknown';

export const isNetworkFailure = (e: unknown) => {
  const err = e as { name?: string; status?: number; message?: string } | null;
  return !!err && (err.status === 0 || /network request failed|failed to fetch/i.test(err.message ?? ''));
};

/** Live connection state. */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
}

/** s-credits: balance split, plan state, top-up packs and history (newest first, paged by date). */
export function useCreditsScreen() {
  return useInfiniteQuery({
    queryKey: creditsKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const [{ data, error }, prices] = await Promise.all([
        supabase.rpc('get_credits_screen', { p_limit: PAGE, p_before: pageParam ?? undefined }),
        pageParam ? {} : storePrices(),
      ]);
      if (error) throw error;
      return priced(data as unknown as CreditsScreenJson, prices);
    },
    getNextPageParam: (last) =>
      last.history.length >= PAGE ? last.history[last.history.length - 1]!.at : undefined,
  });
}

/** s-plans, s-plan-cancel: the reader's subscription and the plan ladder. */
export function usePlanScreen() {
  return useQuery({
    queryKey: planScreenKey,
    queryFn: async () => {
      const [{ data, error }, prices] = await Promise.all([supabase.rpc('get_plan_screen'), storePrices()]);
      if (error) throw error;
      return priced(data as unknown as PlanScreenJson, prices);
    },
  });
}

/** Plans and top-up packs (checkout, rollover wording). */
export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    queryFn: async () => {
      const [{ data, error }, prices] = await Promise.all([supabase.rpc('get_plans'), storePrices()]);
      if (error) throw error;
      return priced(data as unknown as PlansJson, prices);
    },
  });
}

/** Flow 03 rule 36: tip amounts as staff set them (`app_config.tip_presets`, which `tip_author` checks). */
export function useTipPresets(): readonly number[] {
  const q = useQuery({
    queryKey: ['app-config-row', 'tip_presets'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'tip_presets')
        .single();
      if (error) throw error;
      const v = data.value as unknown;
      return Array.isArray(v) && v.every((x) => typeof x === 'number') && v.length ? (v as number[]) : null;
    },
  });
  return q.data ?? TIP_PRESETS;
}

/**
 * Flow 03 rules 28, 31, 36: the unlock and top-up sheets' packs, plan credits and prices, as staff set
 * them (`get_plans`, persisted for offline). The launch values show only until it first loads.
 */
export function useSheetPrices(): {
  packs: readonly TopupPack[];
  plans: readonly Plan[];
  avgBookPrice: number;
} {
  const d = usePlans().data;
  return useMemo(() => {
    if (!d) return { packs: TOPUP_PACKS, plans: LAUNCH_PLANS, avgBookPrice: AVG_BOOK_PRICE };
    const packs = d.topups.map((t) => ({ credits: t.credits, naira: Math.round(t.price_kobo / 100) }));
    const plans = d.plans.map((p) => ({
      id: p.code,
      name: p.name,
      priceNaira: Math.round(p.price_play_kobo / 100),
      priceText: p.price_text,
      monthText: p.month_text,
      credits: p.total_credits,
      months: p.months,
    }));
    return {
      packs: packs.length ? packs : TOPUP_PACKS,
      plans: plans.length ? plans : LAUNCH_PLANS,
      avgBookPrice: Number(d.avg_book_price_credits) || AVG_BOOK_PRICE,
    };
  }, [d]);
}

export async function fetchBalance(): Promise<BalanceJson> {
  const { data, error } = await supabase.rpc('my_credit_balance');
  if (error) throw error;
  return data as unknown as BalanceJson;
}

/** Refresh everything that shows credits or the plan. */
export function refreshCredits() {
  void queryClient.invalidateQueries({ queryKey: creditsKey });
  void queryClient.invalidateQueries({ queryKey: planScreenKey });
  void queryClient.invalidateQueries({ queryKey: balanceKey });
}

// ─── Waiting for credits after a purchase (rule 6: polling, not Realtime) ───
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The server has processed the purchase once the total or the plan period moves. */
const arrived = (before: BalanceJson | null, now: BalanceJson) =>
  before ? now.total > before.total || now.plan_expires_at !== before.plan_expires_at : now.total > 0;

export const POLL_MS = 2000;
export const POLL_WINDOW_MS = 30_000;

/** Balance before a purchase, to compare against. Null when it can't be read. */
export async function balanceBefore(): Promise<BalanceJson | null> {
  try {
    return await fetchBalance();
  } catch {
    return null;
  }
}

/** Poll `my_credit_balance` for up to 30 s. Resolves true when the credits arrived. */
export async function waitForCredits(before: BalanceJson | null, stop: { current: boolean }) {
  const end = Date.now() + POLL_WINDOW_MS;
  while (Date.now() < end && !stop.current) {
    try {
      if (arrived(before, await fetchBalance())) {
        refreshCredits();
        return true;
      }
    } catch {
      // offline for a moment: keep trying until the window closes
    }
    await sleep(POLL_MS);
  }
  return false;
}

let watching = false;
/** After the 30 s window: keep checking in the background (every 10 s, up to 10 min). */
export function keepWatching(before: BalanceJson | null) {
  if (watching) return;
  watching = true;
  void (async () => {
    const end = Date.now() + 10 * 60_000;
    while (Date.now() < end) {
      await sleep(10_000);
      try {
        if (arrived(before, await fetchBalance())) {
          refreshCredits();
          break;
        }
      } catch {
        // try again on the next round
      }
    }
    watching = false;
  })();
}

// ─── Mutations ──────────────────────────────────────────────────────────────
export function usePause() {
  return useMutation({
    mutationFn: async (months: number) => {
      const { error } = await supabase.rpc('pause_subscription', { p_months: months });
      if (error) throw error;
    },
    onSuccess: refreshCredits,
  });
}

export function useResume() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('resume_subscription');
      if (error) throw error;
    },
    onSuccess: refreshCredits,
  });
}

export function useRedeem() {
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('redeem_promo', { p_code: code });
      if (error) throw error;
      return data as unknown as { credits: number; balance: number };
    },
    onSuccess: refreshCredits,
  });
}

// ─── Words and links ────────────────────────────────────────────────────────
/** Plain, specific promo messages (States: Promo code). */
export const PROMO_COPY: Record<string, string> = {
  promo_unknown: 'We don’t know that code. Check it and try again.',
  promo_ended: 'This code has ended.',
  promo_used_up: 'This code has been used up.',
  promo_web_only: 'This code works at web checkout only.',
  promo_already_used: 'You have already used this code.',
  promo_new_readers_only: 'This code is for new readers only.',
};

const PLAY_PACKAGE = 'com.arpedia.reader';
/** Web subscribers manage their plan on the web account page (rule 16). */
export const WEB_ACCOUNT_URL = 'https://arpedia.africa/account';

/** Google Play's page for one subscription (switch, pause, cancel, update payment method). */
export const playManageUrl = (productId?: string | null) =>
  `https://play.google.com/store/account/subscriptions${
    productId ? `?sku=${encodeURIComponent(productId)}&package=${PLAY_PACKAGE}` : ''
  }`;

export const manageUrl = (sub: Pick<SubscriptionJson, 'store' | 'plan'>) =>
  sub.store === 'web' ? WEB_ACCOUNT_URL : playManageUrl(sub.plan.play_product_id);

export const n = (v: number) => v.toLocaleString('en-NG');

/** "12 Feb": a date in Lagos time without the year. */
export const dayMonth = (iso: string | Date) => ledgerDay(iso).replace(/ \d{4}$/, '');

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "12 March": a resume date in words (Lagos time). */
export function longDayMonth(iso: string | Date) {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "every month", "every 3 months", "every year". */
export const everyLabel = (months: number) =>
  months === 1 ? 'every month' : months === 12 ? 'every year' : `every ${months} months`;

/** "month", "quarter", "year": the word for one period of a plan. */
export const periodWord = (months: number) =>
  months === 1 ? 'month' : months === 3 ? 'quarter' : months === 12 ? 'year' : 'period';

/** "Updated 2 hours ago" for the offline note. */
export function updatedAgo(ms: number) {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** "≈ 1½ books": about how many books a pack buys, to the nearest half book. */
export function booksLabel(credits: number, bookPrice = 125) {
  const halves = Math.floor((credits / bookPrice) * 2);
  if (halves < 1) return 'Less than a book';
  const whole = Math.floor(halves / 2);
  const half = halves % 2 ? '½' : '';
  const text = whole ? `${whole}${half}` : half;
  return `≈ ${text} ${halves <= 2 ? 'book' : 'books'}`;
}
