import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  flagOn,
  marginRow,
  missingPlaceholders,
  nextWatMidnight,
  priceExample,
  priceForPages,
  rolloutBucket,
} from './settings';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

describe('price formula', () => {
  it('is ceil(pages × credits per page)', () => {
    expect(priceForPages(250, 0.5)).toBe(125);
    expect(priceForPages(251, 0.5)).toBe(126);
    expect(priceForPages(3, 0.3)).toBe(1);
    expect(priceForPages(10, 0.3)).toBe(3);
    expect(priceForPages(0, 0.5)).toBe(1);
  });
  it('gives the rule 32 example: 62,400 words → 250 pages, 125 credits, ₦375', () => {
    expect(priceExample(62_400, { wordsPerPage: 250, creditsPerPage: 0.5, creditNaira: 3 })).toEqual({
      pages: 250,
      credits: 125,
      naira: 375,
    });
  });
});

describe('plan check', () => {
  const rules = { authorRateKobo: 160, storeFeePct: 15 };
  it('net per credit = price × (1 − fee) ÷ credits, margin = net − author rate', () => {
    // Monthly on Play: ₦900 for 300 credits → 255 kobo net, 95 margin.
    const r = marginRow('monthly', 90_000, 300, rules);
    expect(r.netPerCreditKobo).toBe(255);
    expect(r.marginKobo).toBe(95);
    expect(r.ok).toBe(true);
  });
  it('withholds VAT in the second margin', () => {
    const r = marginRow('monthly', 90_000, 300, { ...rules, vatPct: 7.5 });
    expect(r.marginVatKobo).toBeCloseTo(255 / 1.075 - 160, 2);
    expect(r.marginVatKobo).toBeLessThan(r.marginKobo);
  });
  it('blocks a margin at or below zero', () => {
    // ₦200 for 100 credits at a 20% fee nets exactly 160 kobo → margin 0 → blocked.
    expect(marginRow('x', 20_000, 100, { authorRateKobo: 160, storeFeePct: 20 }).ok).toBe(false);
    expect(marginRow('x', 10_000, 100, rules).ok).toBe(false);
    expect(marginRow('x', 30_000, 100, rules).ok).toBe(true);
  });
});

describe('next 00:00 WAT', () => {
  it('is 23:00 UTC the same day before midnight WAT', () => {
    expect(nextWatMidnight(new Date('2026-11-20T10:00:00Z')).toISOString()).toBe('2026-11-20T23:00:00.000Z');
  });
  it('rolls to the next day once it is past 00:00 WAT', () => {
    // 23:30 UTC is already 00:30 WAT on the 21st.
    expect(nextWatMidnight(new Date('2026-11-20T23:30:00Z')).toISOString()).toBe('2026-11-21T23:00:00.000Z');
    expect(nextWatMidnight(new Date('2026-11-20T23:00:00Z')).toISOString()).toBe('2026-11-21T23:00:00.000Z');
  });
  it('crosses month and year ends', () => {
    expect(nextWatMidnight(new Date('2026-11-30T12:00:00Z')).toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(nextWatMidnight(new Date('2026-11-30T23:10:00Z')).toISOString()).toBe('2026-12-01T23:00:00.000Z');
    expect(nextWatMidnight(new Date('2027-02-28T15:00:00Z')).toISOString()).toBe('2027-02-28T23:00:00.000Z');
    expect(nextWatMidnight(new Date('2026-12-31T22:59:00Z')).toISOString()).toBe('2026-12-31T23:00:00.000Z');
    expect(nextWatMidnight(new Date('2026-12-31T23:01:00Z')).toISOString()).toBe('2027-01-01T23:00:00.000Z');
  });
});

describe('rollout bucket', () => {
  it('puts the same user in the same bucket every time', () => {
    const id = randomUUID();
    const b = rolloutBucket(id, 'gifts', md5);
    for (let i = 0; i < 20; i++) expect(rolloutBucket(id, 'gifts', md5)).toBe(b);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(100);
  });
  it('matches the database hash for a known id', () => {
    // select public._rollout_bucket('00000000-0000-4000-a000-000000000001', 'gifts')
    const hex = md5('gifts:00000000-0000-4000-a000-000000000001').slice(0, 8);
    expect(rolloutBucket('00000000-0000-4000-a000-000000000001', 'gifts', md5)).toBe(parseInt(hex, 16) % 100);
  });
  it('turns on for the rollout share within 1% over 10,000 ids', () => {
    for (const pct of [20, 50, 80]) {
      let on = 0;
      for (let i = 0; i < 10_000; i++) {
        if (flagOn({ key: 'offline_downloads', enabled: true, rolloutPercent: pct }, randomUUID(), '26.1', md5)) on++;
      }
      expect(Math.abs(on / 100 - pct)).toBeLessThanOrEqual(1);
    }
  });
  it('respects off and the minimum app version', () => {
    const id = randomUUID();
    expect(flagOn({ key: 'a', enabled: false, rolloutPercent: 100 }, id, '26.1', md5)).toBe(false);
    expect(flagOn({ key: 'a', enabled: true, rolloutPercent: 100, minAppVersion: '26.1' }, id, '26.0', md5)).toBe(false);
    expect(flagOn({ key: 'a', enabled: true, rolloutPercent: 100, minAppVersion: '26.1' }, id, '26.10', md5)).toBe(true);
  });
});

describe('app version comparison', () => {
  it('compares minor numbers as numbers', () => {
    expect(compareVersions('25.4', '25.10')).toBe(-1);
    expect(compareVersions('25.10', '25.4')).toBe(1);
    expect(compareVersions('26.0', '25.10')).toBe(1);
    expect(compareVersions('25.4', '25.4')).toBe(0);
  });
  it('rejects malformed versions', () => {
    expect(compareVersions('25', '25.4')).toBeNull();
    expect(compareVersions('25.4.1', '25.4')).toBeNull();
  });
});

describe('remote copy placeholders', () => {
  it('lists the required placeholders a text dropped', () => {
    expect(missingPlaceholders('Unlock for {credits} credits?', ['{credits}'])).toEqual([]);
    expect(missingPlaceholders('Unlock this book?', ['{credits}'])).toEqual(['{credits}']);
  });
});
