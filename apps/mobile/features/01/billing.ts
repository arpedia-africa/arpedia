import { LAUNCH_PLANS, type Plan, type PlanId } from '@arpedia/core';
import { failureMessage, isAvailable, purchase as buy, restore as restoreStore } from '../09/purchases';

// Google Play billing lives in features/09/purchases.ts (flow 09). Until the RevenueCat SDK is in the
// app the store reports itself unavailable and the paywall says so (States: Error) instead of
// pretending to sell.

export const STORE_UNAVAILABLE = 'Google Play isn’t available right now.';
export const NO_PLAN_FOUND = 'No plan found on this Google account.';

export interface Store {
  available: boolean;
  /** Plans with store prices (naira). */
  plans: readonly Plan[];
}

/** Plans and whether billing works. */
export async function loadStore(): Promise<Store> {
  return { available: await isAvailable(), plans: LAUNCH_PLANS };
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
