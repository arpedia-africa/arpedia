import { beforeEach, describe, expect, it, vi } from 'vitest';

// Staging test build (owner decision, 24 Nov): the test store answers locally and on staging with
// TEST_STORE=1, never on production; one reader gets at most TEST_STORE_DAILY_CAP test purchases a day.
vi.mock('../../auth', () => ({
  requireUser: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { sub: '11111111-2222-4333-8444-555555555555' });
    await next();
  },
}));

let todayCount = 0;
const rpc = vi.fn();
const query = () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'like', 'gte']) q[m] = () => q;
  q.then = (ok: (v: unknown) => void) => ok({ count: todayCount });
  q.maybeSingle = async () => ({ data: { play_product_id: 'arpedia_topup_200', price_kobo: 60_000 } });
  return q;
};
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc, from: () => query() }) }));

const { default: payments, testStoreOpen, TEST_STORE_DAILY_CAP } = await import('./payments');

const buy = (env: Record<string, unknown>) =>
  payments.request(
    '/test-store',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"kind":"topup","code":"x"}' },
    env,
  );

describe('test store gate', () => {
  beforeEach(() => {
    todayCount = 0;
    rpc.mockReset().mockResolvedValue({ data: { id: 1, outcome: 'topup' }, error: null });
  });

  it('opens locally and on staging with TEST_STORE=1 only', () => {
    expect(testStoreOpen({ APP_ENV: 'local' })).toBe(true);
    expect(testStoreOpen({ APP_ENV: 'staging', TEST_STORE: '1' })).toBe(true);
    expect(testStoreOpen({ APP_ENV: 'staging' })).toBe(false);
    expect(testStoreOpen({ APP_ENV: 'staging', TEST_STORE: 'true' })).toBe(false);
    expect(testStoreOpen({ APP_ENV: 'production', TEST_STORE: '1' })).toBe(false);
  });

  it('answers 404 on production even with the secret set', async () => {
    expect((await buy({ APP_ENV: 'production', TEST_STORE: '1' })).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('answers 404 on staging without the secret', async () => {
    expect((await buy({ APP_ENV: 'staging' })).status).toBe(404);
  });

  it('buys on staging with the secret', async () => {
    const res = await buy({ APP_ENV: 'staging', TEST_STORE: '1' });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('ingest_payment_event', expect.anything());
  });

  it('stops at the daily cap', async () => {
    todayCount = TEST_STORE_DAILY_CAP;
    const res = await buy({ APP_ENV: 'local' });
    expect(res.status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
  });
});
