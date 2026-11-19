import { describe, expect, it } from 'vitest';
import {
  LAUNCH_PLANS,
  approxBooks,
  laterStep,
  nextStep,
  normalisePhone,
  oldEnough,
  parseDob,
  perMonthNaira,
  reminderDate,
  reminderDay,
  renewalDate,
  resumeScreen,
} from './onboarding';

describe('phone normalisation', () => {
  it('accepts the common Nigerian ways of typing a number', () => {
    for (const t of ['803 000 0000', '08030000000', '+2348030000000', '234 803-000-0000', '(0803) 000 0000'])
      expect(normalisePhone(t)).toBe('+2348030000000');
  });
  it('rejects wrong lengths and letters', () => {
    expect(normalisePhone('803 000 000')).toBeNull();
    expect(normalisePhone('80300000001')).toBeNull();
    expect(normalisePhone('803abc0000')).toBeNull();
    expect(normalisePhone('+447700900123')).toBeNull();
  });
  it('uses the country calling code', () => {
    expect(normalisePhone('024 123 4567', '233')).toBe('+233241234567');
  });
  it('keeps the whole number within E.164 lengths, as the database does', () => {
    expect(normalisePhone('123456', '1')).toBeNull();
    expect(normalisePhone('1234567', '1')).toBe('+11234567');
  });
});

describe('age check', () => {
  it('needs 16 full years', () => {
    expect(oldEnough('2010-11-18', '2026-11-18')).toBe(true);
    expect(oldEnough('2010-11-19', '2026-11-18')).toBe(false);
    expect(oldEnough('1899-12-31', '2026-11-18')).toBe(false);
  });
  it('parses DD / MM / YYYY and refuses impossible dates', () => {
    expect(parseDob('02 / 04 / 1990')).toBe('1990-04-02');
    expect(parseDob('29/02/2023')).toBeNull();
    expect(parseDob('1990-04-02')).toBeNull();
  });
});

describe('onboarding step order', () => {
  it('moves forward and finishes at the paywall', () => {
    expect(nextStep('signup')).toBe('interests');
    expect(nextStep('profile')).toBe('plans');
    expect(nextStep('plans')).toBe('done');
    expect(nextStep('done')).toBe('done');
  });
  it('never goes backwards', () => {
    expect(laterStep('role', nextStep('interests'))).toBe('role');
    expect(laterStep('theme', nextStep('theme'))).toBe('role');
  });
  it('resumes at the first unfinished screen, or Home', () => {
    expect(resumeScreen('signup')).toBe('interests');
    expect(resumeScreen('profile')).toBe('profile');
    expect(resumeScreen('plans')).toBeNull();
  });
});

describe('paywall maths', () => {
  it('per-month labels are ₦900, ₦800, ₦700', () => {
    expect(LAUNCH_PLANS.map(perMonthNaira)).toEqual([900, 800, 700]);
  });
  it('book estimates match the prototype', () => {
    expect(LAUNCH_PLANS.map((p) => approxBooks(p.credits))).toEqual([2, 6, 24]);
  });
  it('reminder is 3 days before renewal', () => {
    expect(renewalDate('2026-11-18', 3)).toBe('2027-02-18');
    expect(reminderDate('2027-02-18')).toBe('2027-02-15');
    expect(reminderDay('2026-11-18', 3)).toBe(89);
    expect(renewalDate('2027-01-31', 1)).toBe('2027-02-28');
    expect(reminderDate('2027-03-01')).toBe('2027-02-26');
  });
});
