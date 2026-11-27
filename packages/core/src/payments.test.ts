import { describe, expect, it } from 'vitest';
import {
  normalizeFlutterwaveCharge,
  normalizeFlutterwaveUnpaid,
  normalizeRevenueCat,
  parseTxRef,
  safeEqual,
  storeProductId,
  type IngestInput,
} from './payments';

const USER = '11111111-2222-4333-8444-555555555555';
const rc = (type: string, extra: Record<string, unknown> = {}) => ({
  event: {
    id: `evt-${type}`,
    type,
    app_user_id: USER,
    product_id: 'arpedia_quarterly',
    transaction_id: 'GPA.1-1',
    original_transaction_id: 'GPA.1',
    purchased_at_ms: Date.parse('2026-11-19T10:00:00Z'),
    expiration_at_ms: Date.parse('2027-02-19T10:00:00Z'),
    event_timestamp_ms: Date.parse('2026-11-19T10:00:05Z'),
    price_in_purchased_currency: 2400,
    currency: 'NGN',
    takehome_percentage: 0.85,
    store: 'PLAY_STORE',
    ...extra,
  },
});

describe('RevenueCat', () => {
  it('maps an initial purchase with period and money', () => {
    const r = normalizeRevenueCat(rc('INITIAL_PURCHASE')) as IngestInput;
    expect(r.provider).toBe('revenuecat');
    expect(r.eventId).toBe('evt-INITIAL_PURCHASE');
    expect(r.normalized).toMatchObject({
      type: 'initial_purchase',
      user_id: USER,
      store: 'play',
      txn_id: 'GPA.1-1',
      original_txn_id: 'GPA.1',
      period_end: '2027-02-19T10:00:00.000Z',
      gross_kobo: 240000,
      fee_kobo: 36000,
    });
  });

  it('maps renewals, top-ups, pause and product change', () => {
    expect((normalizeRevenueCat(rc('RENEWAL')) as IngestInput).normalized.type).toBe('renewal');
    expect((normalizeRevenueCat(rc('NON_RENEWING_PURCHASE')) as IngestInput).normalized.type).toBe('topup');
    const pause = normalizeRevenueCat(
      rc('SUBSCRIPTION_PAUSED', { auto_resume_at_ms: Date.parse('2027-03-19T10:00:00Z') }),
    );
    expect((pause as IngestInput).normalized).toMatchObject({
      type: 'pause',
      pause_until: '2027-03-19T10:00:00.000Z',
    });
    const change = normalizeRevenueCat(rc('PRODUCT_CHANGE', { new_product_id: 'arpedia_yearly' }));
    expect((change as IngestInput).normalized).toMatchObject({
      type: 'product_change',
      new_product_id: 'arpedia_yearly',
    });
  });

  it('a customer-support cancellation is a store refund', () => {
    const r = normalizeRevenueCat(rc('CANCELLATION', { cancel_reason: 'CUSTOMER_SUPPORT' })) as IngestInput;
    expect(r.normalized).toMatchObject({ type: 'refund', refund_kobo: 240000 });
    expect(
      (normalizeRevenueCat(rc('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE' })) as IngestInput).normalized
        .type,
    ).toBe('cancellation');
  });

  it('ignores tests, anonymous users, unknown stores and types; no money outside NGN', () => {
    expect(normalizeRevenueCat(rc('TEST'))).toEqual({ ignore: 'test event' });
    expect(normalizeRevenueCat(rc('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:x' }))).toEqual({
      ignore: 'anonymous app user',
    });
    expect(normalizeRevenueCat(rc('INITIAL_PURCHASE', { store: 'STRIPE' }))).toEqual({
      ignore: 'store STRIPE',
    });
    expect(normalizeRevenueCat(rc('TRANSFER'))).toEqual({ ignore: 'type TRANSFER' });
    const usd = normalizeRevenueCat(rc('INITIAL_PURCHASE', { currency: 'USD' })) as IngestInput;
    expect(usd.normalized.gross_kobo).toBeUndefined();
  });

  it('uses the original app user id when the current one is an alias', () => {
    const r = normalizeRevenueCat(
      rc('RENEWAL', { app_user_id: 'alias', original_app_user_id: USER }),
    ) as IngestInput;
    expect(r.normalized.user_id).toBe(USER);
  });

  it('drops the Play base plan from subscription product ids', () => {
    const r = normalizeRevenueCat(
      rc('INITIAL_PURCHASE', { product_id: 'arpedia_quarterly:p3m' }),
    ) as IngestInput;
    expect(r.normalized.product_id).toBe('arpedia_quarterly');
    const c = normalizeRevenueCat(
      rc('PRODUCT_CHANGE', { product_id: 'arpedia_monthly:p1m', new_product_id: 'arpedia_yearly:p1y' }),
    ) as IngestInput;
    expect([c.normalized.product_id, c.normalized.new_product_id]).toEqual([
      'arpedia_monthly',
      'arpedia_yearly',
    ]);
    expect(storeProductId('arpedia_topup_200')).toBe('arpedia_topup_200');
    expect(storeProductId(' ')).toBeUndefined();
  });
});

describe('Flutterwave', () => {
  const tx = {
    id: 9001,
    tx_ref: `arp:plan:monthly:${USER}:n1`,
    amount: 800,
    currency: 'NGN',
    status: 'successful',
    app_fee: 11.2,
    created_at: '2026-11-19T10:00:00.000Z',
    payment_plan: 77,
  };

  it('parses our tx_ref and rejects anything else', () => {
    expect(parseTxRef(tx.tx_ref)).toEqual({ kind: 'plan', code: 'monthly', userId: USER });
    expect(parseTxRef('other:plan:monthly:x')).toBeNull();
    expect(parseTxRef(`arp:gift:monthly:${USER}`)).toBeNull();
  });

  it('maps a plan charge to one subscription per payment plan', () => {
    const r = normalizeFlutterwaveCharge(tx, { renewal: false, months: 1 }) as IngestInput;
    expect(r.eventId).toBe('charge:9001');
    expect(r.normalized).toMatchObject({
      type: 'initial_purchase',
      store: 'web',
      plan_code: 'monthly',
      original_txn_id: `fwplan:77:${USER}`,
      period_end: '2026-12-19T10:00:00.000Z',
      gross_kobo: 80000,
      fee_kobo: 1120,
    });
    const renewal = normalizeFlutterwaveCharge(
      { ...tx, id: 9002 },
      { renewal: true, months: 1 },
    ) as IngestInput;
    expect(renewal.normalized).toMatchObject({ type: 'renewal', original_txn_id: `fwplan:77:${USER}` });
  });

  it('maps a top-up and ignores failed or foreign-currency charges', () => {
    const t = normalizeFlutterwaveCharge(
      { ...tx, tx_ref: `arp:topup:topup_200:${USER}:n2`, amount: 600 },
      { renewal: false },
    );
    expect((t as IngestInput).normalized).toMatchObject({
      type: 'topup',
      topup_code: 'topup_200',
      gross_kobo: 60000,
    });
    expect(normalizeFlutterwaveCharge({ ...tx, status: 'failed' }, { renewal: false })).toEqual({
      ignore: 'status failed',
    });
    expect(normalizeFlutterwaveCharge({ ...tx, currency: 'USD' }, { renewal: false })).toEqual({
      ignore: 'currency USD',
    });
  });

  it('keeps pending and failed charges as unpaid, keyed apart from the success', () => {
    const failed = normalizeFlutterwaveUnpaid({ ...tx, status: 'failed' }) as IngestInput;
    expect(failed.eventId).toBe('charge:9001:failed');
    expect(failed.normalized).toEqual({
      type: 'unpaid',
      user_id: USER,
      store: 'web',
      txn_id: '9001',
      status: 'failed',
      kind: 'plan',
      plan_code: 'monthly',
      gross_kobo: 80000,
    });
    const pending = normalizeFlutterwaveUnpaid({
      ...tx,
      status: 'pending',
      tx_ref: `arp:topup:topup_200:${USER}:n2`,
    }) as IngestInput;
    expect(pending.normalized).toMatchObject({ status: 'pending', kind: 'topup', topup_code: 'topup_200' });
    expect(pending.normalized.plan_code).toBeUndefined();
    expect(normalizeFlutterwaveUnpaid(tx)).toEqual({ ignore: 'status successful' });
    expect(normalizeFlutterwaveUnpaid({ ...tx, status: 'failed', tx_ref: 'other' })).toEqual({
      ignore: 'unknown tx_ref',
    });
  });
});

describe('safeEqual', () => {
  it('compares secrets', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
