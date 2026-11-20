import { describe, expect, it } from 'vitest';
import {
  AUTO_VERIFY_SCORE,
  autoRetryAfterHours,
  cycleBounds,
  earningKobo,
  earningLine,
  flwTransferStatus,
  isAccountNumber,
  maskAccount,
  nameMatchScore,
  payoutDate,
  payoutReference,
  transferStatusApplies,
} from './earnings';
import { chapterPrices } from './pricing';

describe('earning maths', () => {
  it('credits × ₦1.60 in whole kobo, no float error', () => {
    expect(earningKobo(1)).toBe(160);
    expect(earningKobo(530)).toBe(84_800); // ₦848 (open question 2: tips at ₦1.60 too)
    expect(earningKobo(3)).toBe(480); // 3 × 1.6 = 4.800000000000001 in floats
    expect(earningKobo(-12)).toBe(-1920); // reversal rows carry the negative amount
    expect(earningKobo(10, 150)).toBe(1500); // a later rate version
    expect(() => earningKobo(1.5)).toThrow();
  });

  it('pay as you read: chapter earnings never exceed the upfront price, and stopping halfway earns about half', () => {
    const price = 125;
    const parts = chapterPrices(price, [0, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    const all = parts.reduce((a, b) => a + earningKobo(b), 0);
    expect(all).toBe(earningKobo(price));
    // The free chapter and 5 of 10 paid ones: within one credit per chapter of half the price.
    const half = parts.slice(0, 6).reduce((a, b) => a + earningKobo(b), 0);
    expect(Math.abs(half - earningKobo(price) / 2)).toBeLessThanOrEqual(earningKobo(5));
  });
});

describe('cycle line', () => {
  const base = { carryInKobo: 0, adjustmentKobo: 0, bankVerified: true, paused: false, dispute: false };
  it('below ₦1,000 is carried, at ₦1,000 is payable', () => {
    expect(earningLine({ ...base, amountKobo: 99_999 })).toEqual({ payableKobo: 99_999, status: 'carried' });
    expect(earningLine({ ...base, amountKobo: 100_000 }).status).toBe('payable');
  });
  it('carry-ins add up to the minimum; a late return can carry a debit', () => {
    expect(earningLine({ ...base, amountKobo: 60_000, carryInKobo: 40_000 }).status).toBe('payable');
    expect(earningLine({ ...base, amountKobo: 1_000, adjustmentKobo: -5_000 })).toEqual({
      payableKobo: -4_000,
      status: 'carried',
    });
  });
  it('held, not skipped: unverified, paused, dispute', () => {
    expect(earningLine({ ...base, amountKobo: 500_000, bankVerified: false }).status).toBe('held_unverified');
    expect(earningLine({ ...base, amountKobo: 500_000, paused: true }).status).toBe('held_paused');
    expect(earningLine({ ...base, amountKobo: 500_000, dispute: true, paused: true }).status).toBe(
      'held_dispute',
    );
  });
});

describe('payout date', () => {
  it('months run on WAT', () => {
    // 31 Oct 23:30 UTC is 1 Nov 00:30 WAT.
    expect(cycleBounds(new Date('2026-10-31T23:30:00Z')).month).toBe('2026-11-01');
    const oct = cycleBounds(new Date('2026-10-15T12:00:00Z'));
    expect(oct.start.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(oct.end.toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });
  it('first payout day on or after close + hold (October pays 15 Dec)', () => {
    const closed = new Date('2026-10-31T23:05:00Z'); // 1 Nov 00:05 WAT
    expect(payoutDate(closed)).toBe('2026-12-15');
    expect(payoutDate(closed, 14)).toBe('2026-11-15');
    expect(payoutDate(closed, 15)).toBe('2026-12-15');
    expect(payoutDate(new Date('2026-11-30T23:05:00Z'))).toBe('2027-01-15'); // over the year end
    expect(() => payoutDate(closed, 30, 31)).toThrow();
  });
});

describe('transfers', () => {
  it('unique reference per cycle, author and attempt', () => {
    expect(payoutReference('2026-10-01', '00000000-0000-4000-a000-000000000002', 1)).toBe(
      'ARP-PO-202610-0000000000004000a000000000000002-1',
    );
    expect(() => payoutReference('2026-10-02', 'x', 1)).toThrow();
    expect(() => payoutReference('2026-10-01', 'x', 0)).toThrow();
  });
  it('status order: duplicates and late pending change nothing, reversal after success applies', () => {
    expect(transferStatusApplies('queued', 'pending')).toBe(true);
    expect(transferStatusApplies('pending', 'successful')).toBe(true);
    expect(transferStatusApplies('successful', 'successful')).toBe(false);
    expect(transferStatusApplies('successful', 'pending')).toBe(false);
    expect(transferStatusApplies('successful', 'failed')).toBe(false);
    expect(transferStatusApplies('successful', 'reversed')).toBe(true);
    expect(transferStatusApplies('failed', 'successful')).toBe(false);
    expect(transferStatusApplies('pending', 'queued')).toBe(false);
  });
  it('automatic retries: transient only, 1 h then 6 h, then stop', () => {
    expect(autoRetryAfterHours(1, true)).toBe(1);
    expect(autoRetryAfterHours(2, true)).toBe(6);
    expect(autoRetryAfterHours(3, true)).toBeNull();
    expect(autoRetryAfterHours(1, false)).toBeNull();
  });
});

describe('bank accounts', () => {
  it('masks and checks the number', () => {
    expect(maskAccount('0123456789')).toBe('•••• 6789');
    expect(isAccountNumber('0123456789')).toBe(true);
    expect(isAccountNumber('012345678')).toBe(false);
    expect(isAccountNumber('01234567ab')).toBe(false);
  });
  it('fuzzy name score thresholds', () => {
    const legal = 'Ifeoma Chinwe Nwachukwu';
    expect(nameMatchScore('NWACHUKWU IFEOMA CHINWE', legal)).toBe(100);
    expect(nameMatchScore('Mrs Ifeoma C. Nwachukwu', legal)).toBeGreaterThanOrEqual(AUTO_VERIFY_SCORE);
    expect(nameMatchScore('NWACHUKWU IFEOMA', legal)).toBeLessThan(AUTO_VERIFY_SCORE); // surname + first only
    expect(nameMatchScore('Ifeoma Nwachukwu Chinwe Grace', legal)).toBeGreaterThanOrEqual(AUTO_VERIFY_SCORE);
    expect(nameMatchScore('Ifeoma Nwachukwo Chinwe', legal)).toBeGreaterThanOrEqual(AUTO_VERIFY_SCORE); // one typo
    expect(nameMatchScore('Tunde Bakare', legal)).toBeLessThan(40);
    expect(nameMatchScore('', legal)).toBe(0);
  });
});

describe('flutterwave transfer status', () => {
  it('maps statuses and splits transient from account failures', () => {
    expect(flwTransferStatus('NEW')).toEqual({ status: 'pending', transient: false });
    expect(flwTransferStatus('SUCCESSFUL')).toEqual({ status: 'successful', transient: false });
    expect(flwTransferStatus('REVERSED')?.status).toBe('reversed');
    expect(flwTransferStatus('FAILED', 'DISBURSE FAILED: Service unavailable')?.transient).toBe(true);
    expect(flwTransferStatus('FAILED', 'Account name does not match')?.transient).toBe(false);
    expect(flwTransferStatus('FAILED', 'Invalid account number')?.transient).toBe(false);
    expect(flwTransferStatus('WHATEVER')).toBeNull();
  });
});
