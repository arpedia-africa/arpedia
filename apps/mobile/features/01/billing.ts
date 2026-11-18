import { LAUNCH_PLANS, type Plan, type PlanId } from '@arpedia/core';

// Google Play billing through RevenueCat (purchase, restore, store prices) arrives with flow 09,
// together with the `plans` table and grant_plan_credits. Until then the store reports itself
// unavailable and the paywall says so (States: Error) instead of pretending to sell.

export const STORE_UNAVAILABLE = 'Google Play isn’t available right now.';
export const NO_PLAN_FOUND = 'No plan found on this Google account.';

export interface Store {
  available: boolean;
  /** Plans with store prices (naira). */
  plans: readonly Plan[];
}

/** Plans and whether billing works. Flow 09 swaps in RevenueCat offerings and the `plans` rows. */
export async function loadStore(): Promise<Store> {
  return { available: false, plans: LAUNCH_PLANS };
}

/** Buy a plan. Resolves true when the store confirms the purchase. */
export async function purchase(_plan: PlanId): Promise<boolean> {
  throw new Error(STORE_UNAVAILABLE);
}

/** Restore purchases: 'found' when an active plan is on this Google account. */
export async function restore(): Promise<'found' | 'none'> {
  throw new Error(STORE_UNAVAILABLE);
}
