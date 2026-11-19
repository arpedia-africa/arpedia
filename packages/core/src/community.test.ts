import { describe, expect, it } from 'vitest';
import { dayLabel, inboxTime, memberCount, tabBadgeLabel, unreadLabel, uuid7 } from './community';

describe('inboxTime', () => {
  const now = new Date(2026, 10, 18, 12, 0, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it('steps from now to minutes, hours, days, then a date', () => {
    expect(inboxTime(ago(20_000), now)).toBe('now');
    expect(inboxTime(ago(45 * 60_000), now)).toBe('45m');
    expect(inboxTime(ago(60 * 60_000), now)).toBe('1h');
    expect(inboxTime(ago(3 * 3_600_000 + 59 * 60_000), now)).toBe('3h');
    expect(inboxTime(ago(4 * 86_400_000), now)).toBe('4d');
    expect(inboxTime(new Date(2026, 10, 10, 9, 0), now)).toBe('10 Nov');
  });
});

describe('unread caps', () => {
  it('caps rows at 99+ and the tab at 9+', () => {
    expect(unreadLabel(8)).toBe('8');
    expect(unreadLabel(99)).toBe('99');
    expect(unreadLabel(100)).toBe('99+');
    expect(tabBadgeLabel(9)).toBe('9');
    expect(tabBadgeLabel(10)).toBe('9+');
  });
});

describe('memberCount', () => {
  it('uses commas below 10,000 and k above', () => {
    expect(memberCount(64)).toBe('64');
    expect(memberCount(1240)).toBe('1,240');
    expect(memberCount(9999)).toBe('9,999');
    expect(memberCount(10_000)).toBe('10k');
    expect(memberCount(12_400)).toBe('12.4k');
    expect(memberCount(12_499)).toBe('12.4k');
    expect(memberCount(1_250_000)).toBe('1.2M');
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 10, 18, 9, 0);
  it('says Today, Yesterday, then weekday and date', () => {
    expect(dayLabel(new Date(2026, 10, 18, 0, 5), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 17, 23, 59), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 9, 12, 0), now)).toBe('Mon 9 Nov');
  });
});

describe('uuid7', () => {
  it('is a version 7 uuid that sorts by time', () => {
    const a = uuid7(1_700_000_000_000);
    const b = uuid7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});
