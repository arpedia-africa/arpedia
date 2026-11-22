import { describe, expect, it } from 'vitest';
import {
  PLANS,
  aboutBooks,
  addMonths,
  clawback,
  isPromoCode,
  ledgerDate,
  ledgerStamp,
  ledgerDay,
  naira,
  netPerCreditKobo,
  nextPeriodEnd,
  pauseResumeDate,
  planCheck,
  planCredits,
  refundRecommendation,
  reminderAt,
  rollOver,
  spendFromBuckets,
} from './credits';
import { bookPrice, standardPages } from './pricing';

const plan = (code: string) => PLANS.find((p) => p.code === code)!;
const TOPUPS = [
  { code: 'topup_200', credits: 200, priceKobo: 60000 },
  { code: 'topup_500', credits: 500, priceKobo: 150000 },
  { code: 'topup_1000', credits: 1000, priceKobo: 300000 },
];

describe('plans', () => {
  it('credits per period, yearly includes the 200 bonus', () => {
    expect(PLANS.map(planCredits)).toEqual([300, 800, 3000]);
  });

  it('per-month ladder ₦900, ₦800, ₦700 in-app', () => {
    expect(PLANS.map((p) => p.pricePlayKobo / 100 / p.months)).toEqual([900, 800, 700]);
  });

  it('about N books from the 125-credit example book, rounded down', () => {
    expect(aboutBooks(800)).toBe(6);
    expect(aboutBooks(124)).toBe(0);
    expect(aboutBooks(-5)).toBe(0);
  });
});

describe('plan check (rule 26)', () => {
  it('net per credit after a 15% store fee', () => {
    // Yearly in-app: ₦8,400 × 0.85 ÷ 3,000 = ₦2.38
    expect(netPerCreditKobo(840000, 3000)).toBeCloseTo(238, 5);
    // Yearly web: ₦7,500 × 0.85 ÷ 3,000 = ₦2.125
    expect(netPerCreditKobo(750000, 3000)).toBeCloseTo(212.5, 5);
  });

  it('every default plan and top-up beats the ₦1.60 author rate', () => {
    const rows = planCheck(PLANS, TOPUPS, { authorRateKobo: 160, storeFeePct: 15 });
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it('fails a plan whose net drops to or below the author rate', () => {
    const rows = planCheck(PLANS, TOPUPS, { authorRateKobo: 240, storeFeePct: 15 });
    const yearlyPlay = rows.find((r) => r.code === 'yearly' && r.store === 'play')!;
    expect(yearlyPlay.ok).toBe(false);
    expect(rows.find((r) => r.code === 'monthly' && r.store === 'play')!.ok).toBe(true);
  });

  it('rejects zero credits', () => {
    expect(() => netPerCreditKobo(100, 0)).toThrow(RangeError);
  });
});

describe('rollover (rule 11)', () => {
  it('carries unused plan credits up to one plan of the plan renewed into', () => {
    expect(rollOver({ plan: 500, rollover: 0 }, plan('quarterly'))).toEqual({
      expiredRollover: 0,
      rolledOver: 500,
      expiredOverCap: 0,
    });
  });

  it('expires the excess over the cap and old rollover', () => {
    expect(rollOver({ plan: 1200, rollover: 90 }, plan('quarterly'))).toEqual({
      expiredRollover: 90,
      rolledOver: 800,
      expiredOverCap: 400,
    });
  });

  it('uses the new plan for the cap on a downgrade', () => {
    expect(rollOver({ plan: 2000, rollover: 0 }, plan('monthly')).rolledOver).toBe(300);
  });
});

describe('spend order (rule 12)', () => {
  const bal = { rollover: 20, plan: 100, promo: 10, topup: 200 };

  it('rollover, then plan, then promo, then top-up', () => {
    expect(spendFromBuckets(bal, 15)).toEqual({ rollover: 15 });
    expect(spendFromBuckets(bal, 125)).toEqual({ rollover: 20, plan: 100, promo: 5 });
    expect(spendFromBuckets(bal, 330)).toEqual({ rollover: 20, plan: 100, promo: 10, topup: 200 });
  });

  it('insufficient balance throws with the shortfall', () => {
    expect(() => spendFromBuckets(bal, 331)).toThrow('insufficient_credits: missing 1');
  });

  it('rejects zero and fractions', () => {
    expect(() => spendFromBuckets(bal, 0)).toThrow(RangeError);
    expect(() => spendFromBuckets(bal, 1.5)).toThrow(RangeError);
  });
});

describe('dates', () => {
  it('renewal keeps the day, clamped to month end', () => {
    expect(nextPeriodEnd(new Date('2026-01-31T10:00:00Z'), plan('monthly')).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(nextPeriodEnd(new Date('2026-11-19T10:00:00Z'), plan('quarterly')).toISOString()).toBe(
      '2027-02-19T10:00:00.000Z',
    );
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('pause resume date is 1 to 3 months after the period ends', () => {
    expect(pauseResumeDate(new Date('2026-12-12T00:00:00Z'), 2).toISOString()).toBe(
      '2027-02-12T00:00:00.000Z',
    );
    expect(() => pauseResumeDate(new Date(), 4)).toThrow(RangeError);
    expect(() => pauseResumeDate(new Date(), 0)).toThrow(RangeError);
  });

  it('reminder three days before at 09:00 WAT', () => {
    expect(reminderAt(new Date('2026-12-12T15:00:00Z')).toISOString()).toBe('2026-12-09T08:00:00.000Z');
  });

  it('readable ledger dates in Lagos time', () => {
    expect(ledgerDate('2026-11-12T08:14:00Z')).toBe('12 Nov 2026, 09:14');
    expect(ledgerDate('2026-12-31T23:30:00Z')).toBe('1 Jan 2027, 00:30');
    expect(ledgerDay('2026-11-12T08:14:00Z')).toBe('12 Nov 2026');
    const now = new Date('2026-11-19T22:30:00Z'); // 23:30 in Lagos
    expect(ledgerStamp('2026-11-19T07:12:00Z', now)).toBe('Today, 08:12');
    expect(ledgerStamp('2026-11-12T20:14:00Z', now)).toBe('12 Nov, 21:14');
    expect(ledgerStamp('2025-12-04T08:30:00Z', now)).toBe('4 Dec 2025, 09:30');
  });
});

describe('book price rounding', () => {
  it('ceil(pages ÷ 2)', () => {
    expect(bookPrice(standardPages(62_500))).toBe(125);
    expect(bookPrice(251)).toBe(126);
    expect(bookPrice(1)).toBe(1);
  });
});

describe('money and refunds', () => {
  it('naira from kobo', () => {
    expect(naira(240000)).toBe('₦2,400');
    expect(naira(840000)).toBe('₦8,400');
    expect(naira(160)).toBe('₦1.60');
  });

  it('full refund within 7 days and under 25% used', () => {
    expect(refundRecommendation(3, 800, 100)).toBe('full');
    expect(refundRecommendation(3, 800, 200)).toBe('partial');
    expect(refundRecommendation(8, 800, 0)).toBe('partial');
  });

  it('clawback never goes below zero', () => {
    expect(clawback(800, 300)).toEqual({ removed: 300, notRecoverable: 500 });
    expect(clawback(800, 1200)).toEqual({ removed: 800, notRecoverable: 0 });
    expect(clawback(800, -5)).toEqual({ removed: 0, notRecoverable: 800 });
  });

  it('promo codes are 4 to 16 letters or digits, any case', () => {
    expect(isPromoCode(' Harmattan26 ')).toBe(true);
    expect(isPromoCode('abc')).toBe(false);
    expect(isPromoCode('has-dash')).toBe(false);
  });
});
