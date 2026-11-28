import { describe, expect, it } from 'vitest';
import { ago, newLine } from './alerts';

const now = Date.parse('2026-11-27T15:00:00Z'); // 16:00 in Lagos

describe('ago', () => {
  it('reads like the prototype', () => {
    expect(ago('2026-11-27T14:59:40Z', now)).toBe('just now');
    expect(ago('2026-11-27T14:54:00Z', now)).toBe('6 min ago');
    expect(ago('2026-11-27T12:00:00Z', now)).toBe('3 h ago');
    expect(ago('2026-11-26T20:00:00Z', now)).toBe('yesterday');
    expect(ago('2026-11-02T10:00:00Z', now)).toBe('2 Nov');
  });
  it('counts days in Lagos time', () => {
    // 23:30 UTC on the 26th is 00:30 on the 27th in Lagos: today, not yesterday.
    expect(ago('2026-11-26T23:30:00Z', now)).toBe('15 h ago');
  });
});

describe('newLine', () => {
  it('says how many are new', () => {
    expect(newLine(4)).toBe('4 new since you signed in');
    expect(newLine(0)).toBe('Nothing new since you signed in');
  });
});
