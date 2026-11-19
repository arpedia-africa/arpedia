import { describe, expect, it } from 'vitest';
import {
  dateLabel,
  dayOfYear,
  deleteConfirmed,
  goalLine,
  goalStatus,
  inQuietHours,
  nameChangesLeft,
  paceHint,
  validGoal,
} from './profile';

describe('goal status', () => {
  it('is on track when read keeps pace with the year', () => {
    // 19 Nov 2026 is day 323 of 365: floor(24 × 323 / 365) = 21.
    expect(goalStatus(21, 24, '2026-11-19')).toEqual({ kind: 'on_track', read: 21, target: 24, left: 3 });
    expect(goalLine(goalStatus(21, 24, '2026-11-19'))).toBe('21 of 24 · 3 to go, on track');
  });
  it('counts how far behind', () => {
    expect(goalStatus(14, 24, '2026-11-19')).toMatchObject({ kind: 'behind', behind: 7, left: 10 });
    expect(goalLine(goalStatus(14, 24, '2026-11-19'))).toBe('14 of 24 · 10 to go, 7 behind');
  });
  it('is reached once read meets the target, and keeps counting', () => {
    expect(goalStatus(24, 24, '2026-06-01').kind).toBe('reached');
    expect(goalLine(goalStatus(30, 24, '2026-06-01'))).toBe('30 of 24 · Goal reached');
  });
  it('is on track with nothing read on 1 January', () => {
    expect(goalStatus(0, 52, '2027-01-01').kind).toBe('on_track');
  });
  it('uses 366 days in a leap year', () => {
    expect(dayOfYear('2028-12-31')).toEqual({ year: 2028, day: 366, days: 366 });
    expect(dayOfYear('2027-12-31')).toEqual({ year: 2027, day: 365, days: 365 });
    // 29 Feb 2028 is day 60: floor(366 × 60 / 366) = 60.
    expect(goalStatus(59, 366 - 1, '2028-02-29')).toMatchObject({ kind: 'on_track' });
    expect(goalStatus(59, 366, '2028-02-29')).toMatchObject({ kind: 'behind', behind: 1 });
  });
  it('has no status without a goal', () => {
    expect(goalStatus(3, null, '2026-11-19')).toEqual({ kind: 'none' });
    expect(goalLine({ kind: 'none' })).toBe('Set a reading goal');
  });
  it('accepts whole goals from 1 to 365', () => {
    expect(validGoal(1)).toBe(true);
    expect(validGoal(365)).toBe(true);
    expect(validGoal(366)).toBe(false);
    expect(validGoal(0)).toBe(false);
    expect(validGoal(2.5)).toBe(false);
  });
});

describe('pace hint', () => {
  it('reads per month from 12 books up', () => {
    expect(paceHint(24, 14)).toBe("24 books is about 2 a month. You've read 14 so far.");
    expect(paceHint(12, 0)).toBe("12 books is about 1 a month. You've read 0 so far.");
    expect(paceHint(52, 3)).toBe("52 books is about 4 a month. You've read 3 so far.");
  });
  it('reads one every few months below 12', () => {
    expect(paceHint(6, 1)).toBe("6 books is about 1 every 2 months. You've read 1 so far.");
    expect(paceHint(1, 0)).toBe("1 book is about 1 every 12 months. You've read 0 so far.");
  });
});

describe('date label', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  it('shows day and month this year', () => {
    expect(dateLabel('2026-11-10T09:00:00Z', now)).toBe('10 Nov');
  });
  it('adds the year for other years', () => {
    expect(dateLabel('2025-03-02T09:00:00Z', now)).toBe('2 Mar 2025');
  });
  it('uses Lagos time at midnight', () => {
    // 23:30 UTC on 31 Dec is 00:30 on 1 Jan in Lagos.
    expect(dateLabel('2025-12-31T23:30:00Z', now)).toBe('1 Jan');
  });
});

describe('quiet hours', () => {
  it('spans midnight', () => {
    expect(inQuietHours('23:15')).toBe(true);
    expect(inQuietHours('02:00')).toBe(true);
    expect(inQuietHours('06:00')).toBe(false);
    expect(inQuietHours('21:59')).toBe(false);
    expect(inQuietHours('22:00')).toBe(true);
  });
  it('works within one day', () => {
    expect(inQuietHours('13:00', '12:00', '14:00')).toBe(true);
    expect(inQuietHours('15:00', '12:00', '14:00')).toBe(false);
  });
});

describe('name change limit', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  it('allows 3 changes in 30 days', () => {
    expect(nameChangesLeft([], now)).toBe(3);
    expect(nameChangesLeft(['2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'], now)).toBe(1);
    expect(nameChangesLeft(['2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z', '2026-11-18T00:00:00Z'], now)).toBe(0);
  });
  it('forgets changes older than 30 days', () => {
    expect(nameChangesLeft(['2026-10-01T00:00:00Z', '2026-11-10T00:00:00Z', '2026-11-18T00:00:00Z'], now)).toBe(1);
  });
});

describe('delete confirmation', () => {
  it('matches DELETE in any case', () => {
    expect(deleteConfirmed('DELETE')).toBe(true);
    expect(deleteConfirmed(' delete ')).toBe(true);
    expect(deleteConfirmed('Delete')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(deleteConfirmed('DELET')).toBe(false);
    expect(deleteConfirmed('DELETE ME')).toBe(false);
    expect(deleteConfirmed('')).toBe(false);
  });
});
