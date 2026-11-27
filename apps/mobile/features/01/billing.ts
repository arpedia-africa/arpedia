import { LAUNCH_PLANS, type Plan, type PlanId } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import type { PlansJson } from '../09/data';
import {
  failureMessage,
  isAvailable,
  productKey,
  purchase as buy,
  restore as restoreStore,
  storePrices,
} from '../09/purchases';

// Google Play billing lives in features/09/purchases.ts (flow 09). Without a store in the build it
// reports itself unavailable and the paywall says so (States: Error) instead of pretending to sell.

export const STORE_UNAVAILABLE = 'Google Play isn’t available right now.';
export const NO_PLAN_FOUND = 'No plan found on this Google account.';

export interface Store {
  available: boolean;
  /** Plans with Google Play's own price text where the store gave it. */
  plans: readonly Plan[];
}

/** Rule 26: plan names, prices and credits as staff set them (`get_plans`); launch values offline. */
async function serverPlans(): Promise<readonly Plan[]> {
  const { data, error } = await supabase.rpc('get_plans');
  const rows = error ? [] : ((data as unknown as PlansJson | null)?.plans ?? []);
  if (!rows.length) return LAUNCH_PLANS;
  return rows.map((p) => ({
    id: p.code,
    name: p.name,
    priceNaira: Math.round(p.price_play_kobo / 100),
    credits: p.total_credits,
    months: p.months,
  }));
}

/** Plans and whether billing works. The paywall keeps skeleton prices until this resolves. */
export async function loadStore(): Promise<Store> {
  const [available, prices, base] = await Promise.all([isAvailable(), storePrices(), serverPlans()]);
  const plans = base.map((p) => {
    const sp = prices[productKey({ kind: 'plan', code: p.id })];
    return sp ? { ...p, priceText: sp.text, monthText: sp.monthText } : p;
  });
  return { available, plans };
}

/** Buy a plan. Resolves true when the store confirms the purchase. */
export async function purchase(plan: PlanId): Promise<boolean> {
  const res = await buy({ kind: 'plan', code: plan });
  if (res.status === 'error') throw new Error(failureMessage(res.code, res.message));
  return res.status === 'purchased';
}

/** Restore purchases: 'found' when an active plan is on this Google account. */
export async function restore(): Promise<'found' | 'none'> {
  const res = await restoreStore();
  if (res.status === 'error') throw new Error(failureMessage(res.code, res.message));
  return res.status === 'restored' ? 'found' : 'none';
}
