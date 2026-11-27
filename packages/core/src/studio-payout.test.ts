import { describe, expect, it } from 'vitest';
import { EARNING_DEFAULTS, monthPayoutDate, ordinalDay, payoutRules } from './earnings';

describe('Studio payout rules (11-5, 13-13)', () => {
  it('reads the server settings and falls back to the defaults', () => {
    expect(payoutRules(null)).toEqual({
      minPayoutKobo: EARNING_DEFAULTS.minPayoutKobo,
      holdDays: EARNING_DEFAULTS.holdDays,
      payoutDay: EARNING_DEFAULTS.payoutDay,
    });
    expect(payoutRules({ min_payout_kobo: 200000, hold_days: 20, payout_day: 10 })).toEqual({
      minPayoutKobo: 200000,
      holdDays: 20,
      payoutDay: 10,
    });
  });

  it('an open month gets the date the settings give it; a closed one keeps its cycle date', () => {
    const d = payoutRules(null);
    // October closes 1 Nov; + 30 days = 1 Dec; first 15th on or after: 15 Dec.
    expect(monthPayoutDate('2026-10', d)).toBe('2026-12-15');
    // A 20-day hold paid on the 10th: 1 Nov + 20 = 21 Nov, so 10 Dec.
    expect(monthPayoutDate('2026-10', { ...d, holdDays: 20, payoutDay: 10 })).toBe('2026-12-10');
    // A 10-day hold paid on the 15th: 11 Nov, so 15 Nov.
    expect(monthPayoutDate('2026-10', { ...d, holdDays: 10 })).toBe('2026-11-15');
    // December rolls into the next year.
    expect(monthPayoutDate('2026-12', d)).toBe('2027-02-15');
    expect(monthPayoutDate('2026-10', d, '2026-12-16')).toBe('2026-12-16');
  });

  it('says the payout day as an ordinal', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 15, 21, 22, 23, 28].map(ordinalDay)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '15th',
      '21st',
      '22nd',
      '23rd',
      '28th',
    ]);
  });
});
