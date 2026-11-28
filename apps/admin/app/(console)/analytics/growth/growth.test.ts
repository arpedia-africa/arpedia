import { describe, expect, it } from 'vitest';
import { churnDelta, cohortRows, day30, promoLabel, sourceBars, weekLabel, type Growth } from './growth';

const g = (cohorts: Growth['cohorts'], today = '2026-11-27'): Growth => ({
  today,
  cohorts,
  churn: { rate: null, previous: null, plans: [] },
  promos: [],
});

describe('Growth numbers (flow 15 rule 26)', () => {
  it('labels a sign-up week by its Monday', () => {
    expect(weekLabel('2026-10-05')).toBe('Mon 5 Oct');
  });

  it('marks young cells with the day they become known, and small weeks', () => {
    const rows = cohortRows(
      g([
        { week: '2026-10-05', size: 100, d1: 58, d7: 39, d30: 27 },
        { week: '2026-11-02', size: 50, d1: 33, d7: 23, d30: 0 },
        { week: '2026-11-09', size: 3, d1: 1, d7: 0, d30: 0 },
        { week: '2026-11-23', size: 40, d1: 10, d7: 0, d30: 0 },
        { week: '2026-11-16', size: 0, d1: 0, d7: 0, d30: 0 },
      ]),
    );
    expect(rows.map(r => r.week)).toEqual(['2026-10-05', '2026-11-02', '2026-11-09', '2026-11-23']);
    expect(rows[0]!.cells).toEqual([
      { state: 'ready', pct: 58 },
      { state: 'ready', pct: 39 },
      { state: 'ready', pct: 27 },
    ]);
    expect(rows[1]!.cells[2]).toEqual({ state: 'young', label: 'Day 30 on 8 Dec' });
    expect(rows[2]!.cells[0]).toEqual({ state: 'small' });
    expect(rows[3]!.partial).toBe(true);
    expect(rows[0]!.partial).toBe(false);
  });

  it('day 30 retention is the newest known week against the one before', () => {
    const rows = cohortRows(
      g([
        { week: '2026-10-05', size: 100, d1: 58, d7: 39, d30: 27 },
        { week: '2026-10-12', size: 100, d1: 60, d7: 40, d30: 29 },
        { week: '2026-11-02', size: 50, d1: 33, d7: 23, d30: 0 },
      ]),
    );
    expect(day30(rows)).toEqual({ pct: 29, label: 'vs Mon 5 Oct week', delta: { text: '+2 pts', up: true } });
    expect(day30(cohortRows(g([{ week: '2026-11-02', size: 50, d1: 1, d7: 1, d30: 0 }])))).toBeNull();
  });

  it('falling churn reads as good', () => {
    expect(churnDelta(6.2, 6.6)).toEqual({ text: '-0.4 pts', up: true });
    expect(churnDelta(7, 6)).toEqual({ text: '+1 pts', up: false });
    expect(churnDelta(null, 6)).toBeNull();
  });

  it('describes each promo kind', () => {
    expect(promoLabel({ kind: 'plan_discount', amount: 25 })).toBe('25% off a plan');
    expect(promoLabel({ kind: 'bonus_credits', amount: 1000 })).toBe('1,000 bonus credits');
    expect(promoLabel({ kind: 'trial_days', amount: 7 })).toBe('7 free days');
  });

  it('draws signups by source against the largest, Unknown last and muted, small groups empty', () => {
    expect(
      sourceBars([
        { source: 'unknown', signups: 215, share: 6.4 },
        { source: 'play_search', signups: 1482, share: 44.3 },
        { source: 'church', signups: null, share: null },
      ]),
    ).toEqual([
      { label: 'Play Store search', share: 100, signups: 1482, muted: false },
      { label: 'Church group referrals', share: 0, signups: null, muted: false },
      { label: 'Unknown', share: 15, signups: 215, muted: true },
    ]);
    expect(sourceBars(null)).toEqual([]);
  });
});
