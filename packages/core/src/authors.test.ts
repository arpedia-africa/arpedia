import { describe, expect, it } from 'vitest';
import { authorCount, authorRating, postTime, replyLabel, validMessage } from './authors';

describe('authorCount', () => {
  it('is exact below 1,000, then k and m', () => {
    expect(authorCount(0)).toBe('0');
    expect(authorCount(999)).toBe('999');
    expect(authorCount(1000)).toBe('1k');
    expect(authorCount(3420)).toBe('3.4k');
    expect(authorCount(5849)).toBe('5.8k');
    expect(authorCount(12_400)).toBe('12k');
    expect(authorCount(1_250_000)).toBe('1.2m');
  });
});

describe('postTime', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;
  it('reads now, minutes and hours without a double "ago"', () => {
    expect(postTime(ago(30_000), now)).toBe('now');
    expect(postTime(ago(45 * MIN), now)).toBe('45 min ago');
    expect(postTime(ago(2 * 60 * MIN), now)).toBe('2 h ago');
    expect(postTime(ago(23 * 60 * MIN + 59 * MIN), now)).toBe('23 h ago');
  });
  it('uses days up to 30, singular for one', () => {
    expect(postTime(ago(24 * 60 * MIN), now)).toBe('1 day ago');
    expect(postTime(ago(7 * 24 * 60 * MIN), now)).toBe('7 days ago');
    expect(postTime(ago(30 * 24 * 60 * MIN), now)).toBe('30 days ago');
  });
  it('then a date, with the year only when it differs', () => {
    expect(postTime(new Date(2026, 9, 10, 9), now)).toBe('10 Oct');
    expect(postTime(new Date(2025, 10, 10, 9), now)).toBe('10 Nov 2025');
  });
  it('accepts ISO strings', () => {
    expect(postTime(ago(5 * MIN).toISOString(), now)).toBe('5 min ago');
  });
});

describe('replyLabel', () => {
  it('needs 5 replies, then buckets at 24 hours', () => {
    expect(replyLabel(3, 4)).toBeNull();
    expect(replyLabel(null, 10)).toBeNull();
    expect(replyLabel(3, 5)).toBe('within a day');
    expect(replyLabel(23.9, 8)).toBe('within a day');
    expect(replyLabel(24, 8)).toBe('within a few days');
  });
});

describe('authorRating and validMessage', () => {
  it('hides ratings below 5 and keeps one decimal', () => {
    expect(authorRating(4.66, 4)).toBeNull();
    expect(authorRating(4.7, 6)).toBe('4.7★');
  });
  it('trims and checks 1 to 1,000 characters', () => {
    expect(validMessage('   ')).toBe(false);
    expect(validMessage(' hi ')).toBe(true);
    expect(validMessage('x'.repeat(1000))).toBe(true);
    expect(validMessage('x'.repeat(1001))).toBe(false);
  });
});
