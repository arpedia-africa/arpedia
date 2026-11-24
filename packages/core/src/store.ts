// Google Play purchases through RevenueCat (flow 09 rules 5 to 7), without React Native: the app
// (apps/mobile/features/09/purchases.ts) hands in the SDK, so every result can be tested with a
// mocked one. Nothing here grants credits: they come only from the ledger after the server has
// processed the store event, and the screens poll `my_credit_balance` for them.
import { storeProductId } from './payments';

export type PurchaseFailure =
  'store_unavailable' | 'declined' | 'linked_elsewhere' | 'already_owned' | 'network' | 'unknown';

export type PurchaseResult =
  | { status: 'purchased' }
  /** Google Play accepted the order but the payment hasn't cleared (cash, bank transfer). */
  | { status: 'pending' }
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
  already_owned: 'This Google account already has this plan. Tap Restore purchases.',
  network: 'No connection. Check your network and try again.',
  unknown: 'Something went wrong. Try again.',
};

export const PENDING_COPY =
  'Google Play is still waiting for your payment. Your credits will show up once it goes through.';

/** Store messages (declined cards) pass through; everything else uses our own copy. */
export const failureMessage = (code: PurchaseFailure, message?: string) =>
  code === 'declined' && message ? message : PURCHASE_COPY[code];

/** The parts of a RevenueCat `PurchasesStoreProduct` we use. */
export interface StoreProductLike {
  /** `<subscription>:<base plan>` for Play subscriptions, the product id for one-time products. */
  identifier: string;
  priceString: string;
  pricePerMonthString?: string | null;
}

/** The SDK calls we make, in RevenueCat's shapes. Errors are RevenueCat `PurchasesError`s. */
export interface StoreSdk {
  logIn(userId: string): Promise<unknown>;
  logOut(): Promise<unknown>;
  getProducts(ids: string[], category: 'subscription' | 'one_time'): Promise<StoreProductLike[]>;
  purchase(product: StoreProductLike, item: Product): Promise<unknown>;
  restore(): Promise<{ activeSubscriptions: string[] }>;
}

/** Product ids from the database (`get_plans`): new ids, never a v25 one (flow 17 Q2). */
export interface Catalog {
  plans: { code: string; play_product_id: string | null }[];
  topups: { code: string; play_product_id: string | null }[];
}

export interface StorePrice {
  /** The store's own price text, e.g. "₦2,400.00". */
  text: string;
  /** Per month, for subscriptions, when the store gives it. */
  monthText: string | null;
}

/** Key for prices and products: "plan:quarterly", "topup:topup_200". */
export const productKey = (p: Product) => `${p.kind}:${p.code}`;

// RevenueCat PURCHASES_ERROR_CODE values (strings).
const RC: Record<string, PurchaseFailure | 'cancelled' | 'pending'> = {
  '1': 'cancelled', // PURCHASE_CANCELLED_ERROR
  '2': 'declined', // STORE_PROBLEM_ERROR
  '3': 'declined', // PURCHASE_NOT_ALLOWED_ERROR
  '4': 'declined', // PURCHASE_INVALID_ERROR
  '5': 'store_unavailable', // PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR
  '6': 'already_owned', // PRODUCT_ALREADY_PURCHASED_ERROR
  '7': 'linked_elsewhere', // RECEIPT_ALREADY_IN_USE_ERROR
  '10': 'network', // NETWORK_ERROR
  '11': 'store_unavailable', // INVALID_CREDENTIALS_ERROR
  '13': 'linked_elsewhere', // RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR
  '20': 'pending', // PAYMENT_PENDING_ERROR
  '23': 'store_unavailable', // CONFIGURATION_ERROR
  '24': 'store_unavailable', // UNSUPPORTED_ERROR
  '32': 'store_unavailable', // PRODUCT_REQUEST_TIMED_OUT_ERROR
  '33': 'store_unavailable', // API_ENDPOINT_BLOCKED
  '35': 'network', // OFFLINE_CONNECTION_ERROR
  '40': 'linked_elsewhere', // PURCHASE_BELONGS_TO_OTHER_USER
};

/** What a thrown SDK error means for the reader. */
export function purchaseOutcome(err: unknown): PurchaseResult {
  const e = (err ?? {}) as {
    code?: unknown;
    message?: unknown;
    underlyingErrorMessage?: unknown;
    userCancelled?: unknown;
  };
  const mapped = e.userCancelled === true ? 'cancelled' : RC[String(e.code ?? '')];
  if (mapped === 'cancelled') return { status: 'cancelled' };
  if (mapped === 'pending') return { status: 'pending' };
  const code = mapped ?? 'unknown';
  const message =
    code === 'declined'
      ? [e.underlyingErrorMessage, e.message].find(
          (m): m is string => typeof m === 'string' && m.trim() !== '',
        )
      : undefined;
  return message ? { status: 'error', code, message } : { status: 'error', code };
}

const restoreFailure = (err: unknown): RestoreResult => {
  const r = purchaseOutcome(err);
  if (r.status === 'error') return r;
  return { status: 'error', code: r.status === 'pending' ? 'unknown' : 'store_unavailable' };
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject({ code: '32' }), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e: unknown) => (clearTimeout(t), reject(e)),
    );
  });
}

export interface StoreDeps {
  /** null: no store in this build ("store unavailable"). */
  sdk: StoreSdk | null;
  catalog: () => Promise<Catalog>;
  /** The signed-in Arpedia user id: RevenueCat's app user id. */
  currentUser: () => Promise<string | null>;
  timeoutMs?: number;
  /** After a failed product load, price lookups don't wait on the store again for this long. */
  retryAfterMs?: number;
  /** Products (and their prices) are reloaded after this long, so Play price changes show. */
  maxAgeMs?: number;
  now?: () => number;
}

export function createStore({
  sdk,
  catalog,
  currentUser,
  timeoutMs = 10_000,
  retryAfterMs = 60_000,
  maxAgeMs = 30 * 60_000,
  now = Date.now,
}: StoreDeps) {
  let loggedIn: string | null = null;
  let loaded: Promise<Map<string, StoreProductLike>> | null = null;
  let loadedAt = 0;
  let failedAt = -Infinity;
  /** Bumped on sign-out, so a log-in still in flight is undone when it lands. */
  let session = 0;

  /** RevenueCat runs as the Arpedia user, never anonymously. */
  async function ensureUser(s: StoreSdk) {
    const id = await currentUser();
    if (!id) throw { code: '0' };
    if (loggedIn !== id) {
      const mine = session;
      await withTimeout(s.logIn(id), timeoutMs);
      if (mine !== session) {
        await s.logOut().catch(() => undefined);
        throw { code: '0' };
      }
      loggedIn = id;
    }
  }

  async function load(s: StoreSdk) {
    await ensureUser(s);
    const c = await withTimeout(catalog(), timeoutMs);
    const ids = (rows: Catalog['plans']) =>
      rows.map((r) => r.play_product_id).filter((x): x is string => !!x);
    const [subs, packs] = await withTimeout(
      Promise.all([s.getProducts(ids(c.plans), 'subscription'), s.getProducts(ids(c.topups), 'one_time')]),
      timeoutMs,
    );
    const byId = new Map([...subs, ...packs].map((p) => [storeProductId(p.identifier), p]));
    const out = new Map<string, StoreProductLike>();
    for (const [kind, rows] of [
      ['plan', c.plans],
      ['topup', c.topups],
    ] as const)
      for (const r of rows) {
        const p = r.play_product_id ? byId.get(r.play_product_id) : undefined;
        if (p) out.set(productKey({ kind, code: r.code }), p);
      }
    if (!out.size) throw { code: '5' };
    return out;
  }

  /** Products by key; a failed load is retried on the next call, a stale one reloaded. */
  function products(s: StoreSdk) {
    if (loaded && now() - loadedAt > maxAgeMs) loaded = null;
    if (!loaded) {
      loadedAt = now();
      loaded = load(s).catch((e: unknown) => {
        loaded = null;
        failedAt = now();
        throw e;
      });
    }
    return loaded;
  }

  return {
    /** Is Google Play billing usable here (SDK configured, signed in, products found)? */
    async isAvailable(): Promise<boolean> {
      if (!sdk) return false;
      return products(sdk).then(
        () => true,
        () => false,
      );
    },

    /**
     * The store's price text per product key. Empty when the store can't be reached; after a
     * failure, screens don't wait on the store again for `retryAfterMs` (Retry and buying still do).
     */
    async prices(): Promise<Record<string, StorePrice>> {
      if (!sdk) return {};
      if (!loaded && now() - failedAt < retryAfterMs) return {};
      const map = await products(sdk).catch(() => null);
      const out: Record<string, StorePrice> = {};
      for (const [k, p] of map ?? [])
        out[k] = { text: p.priceString, monthText: p.pricePerMonthString ?? null };
      return out;
    },

    /** Buy a plan or a credit pack (rule 5). */
    async purchase(item: Product): Promise<PurchaseResult> {
      if (!sdk) return { status: 'error', code: 'store_unavailable' };
      let product: StoreProductLike | undefined;
      try {
        product = (await products(sdk)).get(productKey(item));
      } catch (e) {
        const r = purchaseOutcome(e);
        return r.status === 'error' && r.code === 'network'
          ? r
          : { status: 'error', code: 'store_unavailable' };
      }
      if (!product) return { status: 'error', code: 'store_unavailable' };
      try {
        await ensureUser(sdk);
        await sdk.purchase(product, item);
        return { status: 'purchased' };
      } catch (e) {
        return purchaseOutcome(e);
      }
    },

    /**
     * Re-sync with the store (rule 7). Never grants credits itself. A subscription owned by another
     * Arpedia account comes back as RevenueCat's "receipt already in use" (the project's restore
     * behaviour is "Keep with original App User ID"): linked_elsewhere, nothing changes.
     */
    async restore(): Promise<RestoreResult> {
      if (!sdk) return { status: 'error', code: 'store_unavailable' };
      try {
        await ensureUser(sdk);
        const info = await sdk.restore();
        const c = await catalog();
        const ours = new Set(c.plans.map((p) => p.play_product_id).filter(Boolean));
        return info.activeSubscriptions.some((id) => ours.has(storeProductId(id) ?? ''))
          ? { status: 'restored' }
          : { status: 'none' };
      } catch (e) {
        return restoreFailure(e);
      }
    },

    /** Sign out of RevenueCat with the Arpedia session. */
    async signOut(): Promise<void> {
      const was = loggedIn;
      session += 1;
      loggedIn = null;
      loaded = null;
      if (sdk && was) await sdk.logOut().catch(() => undefined);
    },
  };
}

export type PlayStore = ReturnType<typeof createStore>;
