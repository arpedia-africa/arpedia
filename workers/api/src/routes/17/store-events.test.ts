import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../env';
import { storeEventsRouter, unmatchedProduct } from './store-events';

// Flow 17 Done when: unknown product ids grant nothing. The stand-in keeps the contract of
// log_unmatched_store_event (one row per event id); pgTAP 17_launch covers the SQL itself.
const KNOWN = ['arpedia_monthly', 'arpedia_yearly', 'arpedia_topup_200'];

function fakeDb() {
  const rows = new Map<string, { product: string; user: string }>();
  const rpc = async (fn: string, args: Record<string, string>) => {
    if (fn !== 'log_unmatched_store_event') throw new Error(`unexpected rpc ${fn}`);
    if (rows.has(args.p_event_id!)) return { data: false, error: null };
    rows.set(args.p_event_id!, { product: args.p_product_id!, user: args.p_app_user_id! });
    return { data: true, error: null };
  };
  const from = (table: string) => ({
    select: async () => ({
      data: (table === 'plans' ? KNOWN.slice(0, 2) : KNOWN.slice(2)).map((id) => ({ play_product_id: id })),
      error: null,
    }),
  });
  return { db: { rpc, from } as never, rows };
}

function harness() {
  const fake = fakeDb();
  const applied: string[] = [];
  const app = new Hono<AppEnv>();
  app.route('/v1/payments', storeEventsRouter(() => fake.db));
  // Flow 09's webhook: anything that reaches it would be applied (subscription, credits).
  const payments = new Hono<AppEnv>();
  payments.post('/revenuecat', async (c) => {
    const body = await c.req.json<{ event: { id: string } }>();
    applied.push(body.event.id);
    return c.json({ ok: true, applied: true });
  });
  app.route('/v1/payments', payments);
  const send = (event: Record<string, unknown>, auth = 'rc-secret') =>
    app.request(
      '/v1/payments/revenuecat',
      { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) },
      { REVENUECAT_WEBHOOK_AUTH: 'rc-secret' },
    );
  return { ...fake, applied, send };
}

const event = (over: Record<string, unknown>) => ({
  id: 'evt-1',
  type: 'INITIAL_PURCHASE',
  app_user_id: '11111111-1111-4111-8111-111111111111',
  product_id: 'arpedia_monthly',
  store: 'PLAY_STORE',
  event_timestamp_ms: 1_790_000_000_000,
  ...over,
});

describe('unmatchedProduct', () => {
  const known = new Set(KNOWN);
  it('passes our products and product-less events through', () => {
    expect(unmatchedProduct(event({}) as never, known)).toBeNull();
    expect(unmatchedProduct(event({ type: 'TRANSFER', product_id: undefined }) as never, known)).toBeNull();
    expect(unmatchedProduct(event({ type: 'TEST', product_id: 'v25_monthly' }) as never, known)).toBeNull();
  });
  it('flags a product we do not sell', () => {
    expect(unmatchedProduct(event({ product_id: 'v25_monthly' }) as never, known)).toBe('v25_monthly');
  });
});

describe('RevenueCat webhook with a v25 product', () => {
  it.each(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'UNCANCELLATION', 'PRODUCT_CHANGE'])(
    '%s grants nothing, answers 200 and is listed once',
    async (type) => {
      const h = harness();
      const e = event({ id: `v25-${type}`, type, product_id: 'arpedia.v25.premium' });
      const first = await h.send(e);
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ ok: true, unmatched: true, duplicate: false });
      const again = await h.send(e);
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ ok: true, unmatched: true, duplicate: true });
      expect(h.applied).toEqual([]);
      expect([...h.rows.values()]).toEqual([{ product: 'arpedia.v25.premium', user: e.app_user_id }]);
    },
  );

  it('records a v25 app user id that is not one of ours', async () => {
    const h = harness();
    await h.send(event({ product_id: 'v25_yearly', app_user_id: '$RCAnonymousID:9f2c' }));
    expect(h.applied).toEqual([]);
    expect(h.rows.get('evt-1')).toEqual({ product: 'v25_yearly', user: '$RCAnonymousID:9f2c' });
  });

  it('leaves our own products to flow 09', async () => {
    const h = harness();
    const res = await h.send(event({ product_id: 'arpedia_topup_200', type: 'NON_RENEWING_PURCHASE' }));
    expect(await res.json()).toEqual({ ok: true, applied: true });
    expect(h.applied).toEqual(['evt-1']);
    expect(h.rows.size).toBe(0);
  });

  it('never records an unauthenticated request', async () => {
    const h = harness();
    await h.send(event({ product_id: 'v25_monthly' }), 'wrong');
    expect(h.rows.size).toBe(0);
  });
});
