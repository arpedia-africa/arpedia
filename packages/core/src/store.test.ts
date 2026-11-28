import { describe, expect, it, vi } from 'vitest';
import { createStore, failureMessage, purchaseOutcome, type StoreSdk } from './store';

const USER = '11111111-2222-4333-8444-555555555555';
const catalog = async () => ({
  plans: [
    { code: 'monthly', play_product_id: 'arpedia_monthly' },
    { code: 'quarterly', play_product_id: 'arpedia_quarterly' },
  ],
  topups: [{ code: 'topup_200', play_product_id: 'arpedia_topup_200' }],
});

function mockSdk(over: Partial<StoreSdk> = {}) {
  const sdk = {
    logIn: vi.fn(async () => ({})),
    logOut: vi.fn(async () => ({})),
    getProducts: vi.fn(async (ids: string[], category: 'subscription' | 'one_time') =>
      category === 'subscription'
        ? ids.map((id) => ({
            identifier: `${id}:base`,
            priceString: `₦${id.length}00`,
            pricePerMonthString: '₦800',
          }))
        : ids.map((id) => ({ identifier: id, priceString: '₦600.00' })),
    ),
    purchase: vi.fn(async () => ({})),
    restore: vi.fn(async () => ({ activeSubscriptions: [] as string[] })),
    ...over,
  };
  return sdk;
}

const make = (sdk: StoreSdk | null, user: string | null = USER) =>
  createStore({ sdk, catalog, currentUser: async () => user, timeoutMs: 50 });

const fail = (code: string, extra: Record<string, unknown> = {}) => ({ code, message: 'sdk', ...extra });

describe('purchaseOutcome', () => {
  it.each([
    ['1', { status: 'cancelled' }],
    ['20', { status: 'pending' }],
    ['7', { status: 'error', code: 'linked_elsewhere' }],
    ['13', { status: 'error', code: 'linked_elsewhere' }],
    ['40', { status: 'error', code: 'linked_elsewhere' }],
    ['6', { status: 'error', code: 'already_owned' }],
    ['10', { status: 'error', code: 'network' }],
    ['35', { status: 'error', code: 'network' }],
    ['5', { status: 'error', code: 'store_unavailable' }],
    ['23', { status: 'error', code: 'store_unavailable' }],
    ['99', { status: 'error', code: 'unknown' }],
  ])('code %s', (code, want) => {
    expect(purchaseOutcome({ code })).toEqual(want);
  });

  it('declined passes the store message through', () => {
    const r = purchaseOutcome(fail('2', { underlyingErrorMessage: 'Your card was declined.' }));
    expect(r).toEqual({ status: 'error', code: 'declined', message: 'Your card was declined.' });
    expect(failureMessage('declined', 'Your card was declined.')).toBe('Your card was declined.');
    expect(failureMessage('declined')).toBe('Google Play couldn’t take the payment. Try again.');
  });

  it('userCancelled wins and junk is unknown', () => {
    expect(purchaseOutcome({ code: '2', userCancelled: true })).toEqual({ status: 'cancelled' });
    expect(purchaseOutcome(undefined)).toEqual({ status: 'error', code: 'unknown' });
  });
});

describe('createStore timing', () => {
  it('after a failed load, prices answer at once until the retry window ends; buying still retries', async () => {
    let t = 0;
    const getProducts = vi.fn(async () => Promise.reject({ code: '10' }));
    const sdk = mockSdk({ getProducts });
    const s = createStore({ sdk, catalog, currentUser: async () => USER, retryAfterMs: 1000, now: () => t });
    expect(await s.prices()).toEqual({});
    const calls = getProducts.mock.calls.length;
    expect(await s.prices()).toEqual({});
    expect(getProducts.mock.calls.length).toBe(calls);
    await s.purchase({ kind: 'plan', code: 'monthly' });
    expect(getProducts.mock.calls.length).toBeGreaterThan(calls);
    t = 2000;
    const before = getProducts.mock.calls.length;
    await s.prices();
    expect(getProducts.mock.calls.length).toBeGreaterThan(before);
  });

  it('reloads products after maxAge so Play price changes show', async () => {
    let t = 0;
    const sdk = mockSdk();
    const s = createStore({ sdk, catalog, currentUser: async () => USER, maxAgeMs: 1000, now: () => t });
    await s.prices();
    await s.prices();
    expect(sdk.getProducts).toHaveBeenCalledTimes(2);
    t = 5000;
    await s.prices();
    expect(sdk.getProducts).toHaveBeenCalledTimes(4);
  });

  it('a sign-out during a log-in logs out again when the log-in lands', async () => {
    let finish: () => void = () => undefined;
    const sdk = mockSdk({ logIn: vi.fn(() => new Promise<unknown>((r) => (finish = () => r({})))) });
    const s = createStore({ sdk, catalog, currentUser: async () => USER });
    const buying = s.purchase({ kind: 'plan', code: 'monthly' });
    await new Promise((r) => setTimeout(r, 0));
    await s.signOut();
    finish();
    expect((await buying).status).toBe('error');
    expect(sdk.logOut).toHaveBeenCalled();
    expect(sdk.purchase).not.toHaveBeenCalled();
  });
});

describe('createStore', () => {
  it('without an SDK the store is unavailable and nothing can be bought', async () => {
    const s = make(null);
    expect(await s.isAvailable()).toBe(false);
    expect(await s.prices()).toEqual({});
    expect(await s.purchase({ kind: 'plan', code: 'monthly' })).toEqual({
      status: 'error',
      code: 'store_unavailable',
    });
    expect(await s.restore()).toEqual({ status: 'error', code: 'store_unavailable' });
  });

  it('logs in as the Arpedia user, loads database product ids and shows store prices', async () => {
    const sdk = mockSdk();
    const s = make(sdk);
    expect(await s.isAvailable()).toBe(true);
    expect(sdk.logIn).toHaveBeenCalledWith(USER);
    expect(sdk.getProducts).toHaveBeenCalledWith(['arpedia_monthly', 'arpedia_quarterly'], 'subscription');
    expect(sdk.getProducts).toHaveBeenCalledWith(['arpedia_topup_200'], 'one_time');
    const prices = await s.prices();
    expect(prices['plan:quarterly']).toEqual({ text: '₦1700', monthText: '₦800' });
    expect(prices['topup:topup_200']).toEqual({ text: '₦600.00', monthText: null });
    expect(sdk.logIn).toHaveBeenCalledTimes(1);
  });

  it('purchased: buys the matching store product', async () => {
    const sdk = mockSdk();
    const r = await make(sdk).purchase({ kind: 'plan', code: 'quarterly' });
    expect(r).toEqual({ status: 'purchased' });
    expect(sdk.purchase).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'arpedia_quarterly:base' }),
      { kind: 'plan', code: 'quarterly' },
    );
  });

  it.each([
    ['1', { status: 'cancelled' }],
    ['20', { status: 'pending' }],
    ['2', { status: 'error', code: 'declined', message: 'sdk' }],
    ['7', { status: 'error', code: 'linked_elsewhere' }],
    ['10', { status: 'error', code: 'network' }],
  ])('purchase error %s', async (code, want) => {
    const sdk = mockSdk({ purchase: vi.fn(async () => Promise.reject(fail(code))) });
    expect(await make(sdk).purchase({ kind: 'topup', code: 'topup_200' })).toEqual(want);
  });

  it('a product the store does not know is unavailable', async () => {
    const sdk = mockSdk();
    expect(await make(sdk).purchase({ kind: 'topup', code: 'topup_1000' })).toEqual({
      status: 'error',
      code: 'store_unavailable',
    });
    expect(sdk.purchase).not.toHaveBeenCalled();
  });

  it('a store that does not answer is unavailable, then retried', async () => {
    const getProducts = vi.fn(() => new Promise<never>(() => undefined));
    const sdk = mockSdk({ getProducts });
    const s = make(sdk);
    expect(await s.isAvailable()).toBe(false);
    expect(await s.prices()).toEqual({});
    expect(await s.isAvailable()).toBe(false);
    expect(getProducts.mock.calls.length).toBeGreaterThan(2);
  });

  it('offline while loading products is a network error', async () => {
    const sdk = mockSdk({ getProducts: vi.fn(async () => Promise.reject(fail('10'))) });
    expect(await make(sdk).purchase({ kind: 'plan', code: 'monthly' })).toEqual({
      status: 'error',
      code: 'network',
    });
  });

  it('never buys without a signed-in user', async () => {
    const sdk = mockSdk();
    const r = await make(sdk, null).purchase({ kind: 'plan', code: 'monthly' });
    expect(r.status).toBe('error');
    expect(sdk.purchase).not.toHaveBeenCalled();
  });

  it('restore: restored, none, linked to another account, offline', async () => {
    const active = mockSdk({
      restore: vi.fn(async () => ({ activeSubscriptions: ['arpedia_monthly:base'] })),
    });
    expect(await make(active).restore()).toEqual({ status: 'restored' });
    const v25 = mockSdk({ restore: vi.fn(async () => ({ activeSubscriptions: ['v25_monthly'] })) });
    expect(await make(v25).restore()).toEqual({ status: 'none' });
    expect(await make(mockSdk()).restore()).toEqual({ status: 'none' });
    const linked = mockSdk({ restore: vi.fn(async () => Promise.reject(fail('7'))) });
    expect(await make(linked).restore()).toEqual({ status: 'error', code: 'linked_elsewhere' });
    const offline = mockSdk({ restore: vi.fn(async () => Promise.reject(fail('10'))) });
    expect(await make(offline).restore()).toEqual({ status: 'error', code: 'network' });
  });

  it('signs out of RevenueCat with the session and in again as the next user', async () => {
    let user: string | null = USER;
    const sdk = mockSdk();
    const s = createStore({ sdk, catalog, currentUser: async () => user, timeoutMs: 50 });
    await s.purchase({ kind: 'plan', code: 'monthly' });
    await s.signOut();
    expect(sdk.logOut).toHaveBeenCalledTimes(1);
    user = '22222222-2222-4333-8444-555555555555';
    await s.purchase({ kind: 'plan', code: 'monthly' });
    expect(sdk.logIn).toHaveBeenLastCalledWith(user);
    await createStore({ sdk: mockSdk(), catalog, currentUser: async () => null }).signOut();
  });
});
