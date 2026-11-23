// Google Play purchases for flow 09 (rules 5 to 7). RevenueCat (`react-native-purchases`) is not a
// dependency of this app yet, so this module is the one seam the screens use: when the native SDK is
// added, only the bodies below change. Nothing here ever grants credits: credits come from the ledger
// after the server processes the store event, and the screens poll `my_credit_balance` for them.
import { supabase } from '@/lib/supabase';

export type PurchaseFailure = 'store_unavailable' | 'declined' | 'linked_elsewhere' | 'network' | 'unknown';

export type PurchaseResult =
  | { status: 'purchased' }
  /** The reader closed the Google Play sheet: go back to the screen silently. */
  | { status: 'cancelled' }
  | { status: 'error'; code: PurchaseFailure; message?: string };

export type RestoreResult =
  { status: 'restored' } | { status: 'none' } | { status: 'error'; code: PurchaseFailure; message?: string };

export type Product = { kind: 'plan'; code: string } | { kind: 'topup'; code: string };

export const PURCHASE_COPY: Record<PurchaseFailure, string> = {
  store_unavailable: 'Google Play is not responding. Try again.',
  declined: 'Google Play couldn’t take the payment. Try again.',
  linked_elsewhere: 'This Google Play subscription is linked to another Arpedia account.',
  network: 'No connection. Check your network and try again.',
  unknown: 'Something went wrong. Try again.',
};

/** Store messages (declined cards) pass through; everything else uses our own copy. */
export const failureMessage = (code: PurchaseFailure, message?: string) =>
  code === 'declined' && message ? message : PURCHASE_COPY[code];

// Local test store (flow 17 whole-app check): `node tools/dev-vars.mjs` sets EXPO_PUBLIC_TEST_STORE for
// local builds only, and the api Worker answers /v1/payments/test-store only on APP_ENV local.
const TEST_STORE = process.env.EXPO_PUBLIC_TEST_STORE === '1';
const api = process.env.EXPO_PUBLIC_API_URL ?? '';

/** Is Google Play billing usable on this phone? Dev stub: no (yes with the local test store). */
export async function isAvailable(): Promise<boolean> {
  return TEST_STORE;
}

/** Buy a plan or a top-up pack through Google Play. */
export async function purchase(product: Product): Promise<PurchaseResult> {
  if (!TEST_STORE) return { status: 'error', code: 'store_unavailable' };
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`${api}/v1/payments/test-store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify(product),
    });
    return res.ok ? { status: 'purchased' } : { status: 'error', code: 'unknown' };
  } catch {
    return { status: 'error', code: 'network' };
  }
}

/** Re-sync with the store. Never grants credits itself (rule 7). */
export async function restore(): Promise<RestoreResult> {
  return { status: 'error', code: 'store_unavailable' };
}
