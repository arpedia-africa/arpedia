// Google Play purchases for flow 09 (rules 5 to 7). The logic and every result live in
// `@arpedia/core` (store.ts, unit-tested with a mocked SDK); this file only picks the store:
//   - RevenueCat (`react-native-purchases`) when EXPO_PUBLIC_REVENUECAT_ANDROID_KEY is set,
//   - the local test store only in kit or dev builds with EXPO_PUBLIC_TEST_STORE (flow 17 journeys),
//   - otherwise none, and every screen says "Google Play is not responding".
// Nothing here ever grants credits: credits come from the ledger after the server processes the
// store event, and the screens poll `my_credit_balance` for them. The RevenueCat app user id is
// the Arpedia user id; we log in to RevenueCat with the session and out when it ends.
import { Platform } from 'react-native';
import { createStore, formatNaira, type Catalog, type StoreSdk } from '@arpedia/core';
import { supabase } from '@/lib/supabase';

export {
  PENDING_COPY,
  PURCHASE_COPY,
  failureMessage,
  productKey,
  type Product,
  type PurchaseFailure,
  type PurchaseResult,
  type RestoreResult,
  type StorePrice,
} from '@arpedia/core';

const KEY = Platform.OS === 'android' ? (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '') : '';
// Written out here (not `kitEnabled`) so a release build without the kit folds this to false and
// drops the test store from the bundle (preflight `test_store` checks the AAB).
const TEST_STORE =
  (__DEV__ || process.env.EXPO_PUBLIC_KIT === '1') && process.env.EXPO_PUBLIC_TEST_STORE === '1';

interface PlansRpc {
  plans: { code: string; play_product_id: string | null; price_play_kobo: number }[];
  topups: { code: string; play_product_id: string | null; price_kobo: number }[];
}

async function plansRpc(): Promise<PlansRpc> {
  const { data, error } = await supabase.rpc('get_plans');
  if (error) throw error;
  return data as unknown as PlansRpc;
}

async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** RevenueCat. Required lazily so a build without the native module still starts. */
function revenueCat(apiKey: string): StoreSdk {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rc = require('react-native-purchases') as typeof import('react-native-purchases');
  const Purchases = rc.default;
  let configured = false;
  return {
    async logIn(userId) {
      if (!configured) {
        Purchases.configure({ apiKey, appUserID: userId });
        configured = true;
        return;
      }
      await Purchases.logIn(userId);
    },
    async logOut() {
      if (configured) await Purchases.logOut();
    },
    getProducts: (ids, category) =>
      ids.length
        ? Purchases.getProducts(
            ids,
            category === 'subscription'
              ? rc.PRODUCT_CATEGORY.SUBSCRIPTION
              : rc.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
          )
        : Promise.resolve([]),
    purchase: (product) =>
      Purchases.purchaseStoreProduct(product as import('react-native-purchases').PurchasesStoreProduct),
    restore: () => Purchases.restorePurchases(),
  };
}

/**
 * Local test store (flow 17 whole-app check): `node tools/dev-vars.mjs` sets EXPO_PUBLIC_TEST_STORE
 * for local builds only, and the api Worker answers /v1/payments/test-store only on APP_ENV local.
 */
function testStore(): StoreSdk {
  const api = process.env.EXPO_PUBLIC_API_URL ?? '';
  return {
    logIn: async () => undefined,
    logOut: async () => undefined,
    async getProducts(ids, category) {
      const p = await plansRpc();
      const rows =
        category === 'subscription'
          ? p.plans.map((r) => ({ id: r.play_product_id, kobo: r.price_play_kobo }))
          : p.topups.map((r) => ({ id: r.play_product_id, kobo: r.price_kobo }));
      return rows
        .filter((r): r is { id: string; kobo: number } => !!r.id && ids.includes(r.id))
        .map((r) => ({ identifier: r.id, priceString: formatNaira(r.kobo / 100) }));
    },
    async purchase(_product, item) {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`${api}/v1/payments/test-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify(item),
      }).catch(() => Promise.reject({ code: '10' }));
      if (!res.ok) throw { code: '0' };
    },
    restore: () => Promise.reject({ code: '24' }),
  };
}

const sdk = KEY ? revenueCat(KEY) : TEST_STORE ? testStore() : null;

const store = createStore({
  sdk,
  catalog: async (): Promise<Catalog> => plansRpc(),
  currentUser,
});

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') void store.signOut();
});

/** Is Google Play billing usable on this phone? */
export const isAvailable = () => store.isAvailable();

/** The store's own price text per product key ("plan:quarterly"); empty when unreachable. */
export const storePrices = () => store.prices();

/** Buy a plan or a top-up pack through Google Play. */
export const purchase = store.purchase;

/** Re-sync with the store. Never grants credits itself (rule 7). */
export const restore = store.restore;
