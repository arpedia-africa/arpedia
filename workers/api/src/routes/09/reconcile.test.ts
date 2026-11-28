import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec check 09-5: weekly store_reconcile. Every provider call is mocked; nothing reaches
// RevenueCat or Flutterwave. pgTAP 09_store_reconcile_test.sql covers record_store_reconcile.
const deliverNotices = vi.fn(async (..._a: unknown[]) => [true]);
vi.mock('../15/notify', () => ({ deliverNotices }));

const { diff, isReconcileTime, rcPurchases, reconcileWindow, storeReconcile } = await import('./reconcile');

const NOW = Date.parse('2026-11-30T02:00:00Z'); // a Monday, 02:00 UTC
const w = reconcileWindow(NOW);
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const inside = '2026-11-27T10:00:00.000Z';
const before = '2026-11-20T10:00:00.000Z'; // more than 8 days back

const our = (id: string, o: Partial<Record<string, unknown>> = {}) => ({
  store_txn_id: id,
  user_id: U1,
  created_at: inside,
  status: 'succeeded',
  gross_kobo: 60000,
  kind: 'topup',
  plan_code: null,
  topup_code: 'topup_200',
  ...o,
});

describe('diff', () => {
  it('matches both sides and reports each side only inside the window', () => {
    const d = diff(
      [
        { id: 'a', at: inside },
        { id: 'b', at: inside, user_id: U2, amount_kobo: 90000, product: 'monthly' },
        { id: 'old', at: before },
      ],
      [our('a'), our('c'), our('d', { created_at: before }), our('e', { status: 'failed' })],
      w,
    );
    expect(d.matched).toBe(1);
    expect(d.providerCount).toBe(2);
    expect(d.oursCount).toBe(2);
    expect(d.items).toEqual([
      {
        side: 'provider_only',
        store_txn_id: 'b',
        user_id: U2,
        amount_kobo: 90000,
        at: inside,
        product: 'monthly',
      },
      {
        side: 'ours_only',
        store_txn_id: 'c',
        user_id: U1,
        amount_kobo: 60000,
        at: inside,
        product: 'topup_200',
      },
    ]);
  });

  it('a purchase we stored a little outside the window still matches', () => {
    const d = diff([{ id: 'a', at: inside }], [our('a', { created_at: before })], w);
    expect(d.items).toEqual([]);
    expect(d.matched).toBe(1);
  });

  it('only rows the provider can vouch for are reported as ours_only', () => {
    const d = diff(
      [],
      [our('p', { kind: 'plan', plan_code: 'monthly', topup_code: null })],
      w,
      (t) => t.kind === 'topup',
    );
    expect(d.items).toEqual([]);
  });

  it('ours_only checks against every listed id when given', () => {
    const d = diff([], [our('x')], w, undefined, new Set(['x']));
    expect(d.items).toEqual([]);
  });
});

describe('rcPurchases', () => {
  it('reads Play top-ups and the latest subscription period', () => {
    expect(
      rcPurchases(U1, {
        subscriber: {
          non_subscriptions: {
            arpedia_topup_200: [
              { id: 'r1', purchase_date: inside, store: 'play_store', store_transaction_id: 'GPA.1' },
              { id: 'r2', purchase_date: inside, store: 'app_store', store_transaction_id: 'ios' },
            ],
          },
          subscriptions: {
            'arpedia_plan:monthly': {
              purchase_date: inside,
              store: 'play_store',
              store_transaction_id: 'GPA.2..0',
            },
            other: { purchase_date: inside, store: 'play_store' },
          },
        },
      }),
    ).toEqual([
      { id: 'GPA.1', at: inside, user_id: U1, product: 'arpedia_topup_200' },
      { id: 'GPA.2..0', at: inside, user_id: U1, product: 'arpedia_plan:monthly' },
    ]);
  });
});

describe('isReconcileTime', () => {
  it('is Monday 02:00 UTC only', () => {
    expect(isReconcileTime(NOW)).toBe(true);
    expect(isReconcileTime(NOW + 60_000)).toBe(false);
    expect(isReconcileTime(NOW + 86_400_000)).toBe(false);
  });
});

// ─── storeReconcile with a fake database and fake providers ─────────────────
const tables: Record<string, Record<string, unknown>[]> = {};
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
  data: { run_id: 1, new_alerts: 0 } as unknown,
  error: null,
}));
const from = (table: string) => {
  const eqs: [string, unknown][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'gte', 'lt', 'order', 'limit', 'range']) chain[m] = () => chain;
  chain.eq = (k: string, v: unknown) => {
    eqs.push([k, v]);
    return chain;
  };
  chain.then = (ok: (v: unknown) => unknown) =>
    ok({ data: (tables[table] ?? []).filter((r) => eqs.every(([k, v]) => r[k] === v)), error: null });
  return chain;
};
const db = { rpc, from } as never;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const env = { FLUTTERWAVE_SECRET_KEY: 'flw', REVENUECAT_API_KEY: 'rc' } as never;

beforeEach(() => {
  rpc.mockClear();
  deliverNotices.mockClear();
  tables.transactions = [];
  tables.payment_events = [];
});

const recorded = (provider: string) =>
  rpc.mock.calls.find(([fn, a]) => fn === 'record_store_reconcile' && a.p_provider === provider)?.[1];

describe('storeReconcile', () => {
  it('records both providers, raises unmatched purchases and emails Finance once', async () => {
    tables.transactions = [
      { ...our('GPA.1'), store: 'play' },
      { ...our('GPA.9'), store: 'play' }, // RevenueCat doesn't list it
      { ...our('777', { user_id: U2 }), store: 'web' },
      { ...our('778', { user_id: U2, status: 'pending' }), store: 'web' },
    ];
    tables.payment_events = [{ provider: 'revenuecat', normalized: { user_id: U2 } }];
    rpc.mockImplementation(async (fn: string, a: Record<string, unknown>) => ({
      data: { run_id: 1, new_alerts: (a.p_items as unknown[]).length } as unknown,
      error: null,
    }));
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer (rc|flw)$/);
      if (url.includes(`/subscribers/${U1}`)) {
        return json({
          subscriber: {
            non_subscriptions: {
              arpedia_topup_200: [
                { purchase_date: inside, store: 'play_store', store_transaction_id: 'GPA.1' },
              ],
            },
          },
        });
      }
      if (url.includes(`/subscribers/${U2}`)) {
        return json({
          subscriber: {
            subscriptions: {
              'arpedia_plan:monthly': {
                purchase_date: inside,
                store: 'play_store',
                store_transaction_id: 'GPA.5',
              },
            },
          },
        });
      }
      if (url.includes('/transactions?')) {
        const page = Number(new URL(url).searchParams.get('page'));
        return json({
          status: 'success',
          meta: { page_info: { total_pages: 2 } },
          data:
            page === 1
              ? [
                  {
                    id: 777,
                    tx_ref: `arp:topup:topup_200:${U2}:n1`,
                    amount: 600,
                    currency: 'NGN',
                    status: 'successful',
                    created_at: inside,
                  },
                  {
                    id: 778,
                    tx_ref: `arp:plan:monthly:${U2}:n2`,
                    amount: 900,
                    currency: 'NGN',
                    status: 'pending',
                    created_at: inside,
                  },
                ]
              : [
                  {
                    id: 779,
                    tx_ref: `arp:plan:monthly:${U1}:n3`,
                    amount: 900,
                    currency: 'NGN',
                    status: 'successful',
                    created_at: inside,
                  },
                  {
                    id: 5,
                    tx_ref: 'v25-legacy',
                    amount: 900,
                    currency: 'NGN',
                    status: 'successful',
                    created_at: inside,
                  },
                ],
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const out = await storeReconcile(env, NOW, db, fetcher as never);

    expect(out.map((r) => [r.provider, r.status])).toEqual([
      ['revenuecat', 'ok'],
      ['flutterwave', 'ok'],
    ]);
    expect(
      urls.every(
        (u) => u.startsWith('https://api.revenuecat.com/') || u.startsWith('https://api.flutterwave.com/'),
      ),
    ).toBe(true);
    const rc = recorded('revenuecat')!;
    expect(rc.p_matched).toBe(1);
    expect(rc.p_items).toEqual([
      expect.objectContaining({ side: 'provider_only', store_txn_id: 'GPA.5', user_id: U2 }),
      expect.objectContaining({ side: 'ours_only', store_txn_id: 'GPA.9' }),
    ]);
    const fw = recorded('flutterwave')!;
    expect(fw.p_status).toBe('ok');
    expect(fw.p_matched).toBe(1);
    expect(fw.p_provider_count).toBe(2);
    expect(fw.p_items).toEqual([
      expect.objectContaining({
        side: 'provider_only',
        store_txn_id: '779',
        user_id: U1,
        amount_kobo: 90000,
      }),
    ]);
    expect(deliverNotices).toHaveBeenCalledTimes(1);
    expect(deliverNotices.mock.calls[0]![2]).toEqual([
      expect.objectContaining({ kind: 'finance_alert', alert: 'store_unmatched', count: 3 }),
    ]);
  });

  it('a clean week sends no email', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/transactions?')
        ? json({ status: 'success', data: [], meta: { page_info: { total_pages: 1 } } })
        : json({}),
    );
    await storeReconcile(env, NOW, db, fetcher as never);
    expect(recorded('revenuecat')).toMatchObject({ p_status: 'ok', p_items: [] });
    expect(recorded('flutterwave')).toMatchObject({ p_status: 'ok', p_items: [] });
    expect(deliverNotices).not.toHaveBeenCalled();
  });

  it('without keys both runs are recorded as skipped and nothing is fetched', async () => {
    const fetcher = vi.fn();
    await storeReconcile({} as never, NOW, db, fetcher as never);
    expect(fetcher).not.toHaveBeenCalled();
    expect(recorded('revenuecat')).toMatchObject({ p_status: 'skipped', p_error: 'not_configured' });
    expect(recorded('flutterwave')).toMatchObject({ p_status: 'skipped', p_error: 'not_configured' });
    expect(deliverNotices).not.toHaveBeenCalled();
  });

  it('a provider error is recorded as failed, the other still runs, and Finance is told', async () => {
    tables.transactions = [{ ...our('GPA.1'), store: 'play' }];
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/subscribers/')
        ? json({}, 500)
        : json({ status: 'success', data: [], meta: { page_info: { total_pages: 1 } } }),
    );
    await storeReconcile(env, NOW, db, fetcher as never);
    expect(recorded('revenuecat')).toMatchObject({ p_status: 'failed', p_items: [] });
    expect(String(recorded('revenuecat')!.p_error)).toContain('500');
    expect(recorded('flutterwave')).toMatchObject({ p_status: 'ok' });
    expect(deliverNotices.mock.calls[0]![2]).toEqual([
      expect.objectContaining({ alert: 'store_reconcile_failed', failed: ['revenuecat'] }),
    ]);
  });
});
