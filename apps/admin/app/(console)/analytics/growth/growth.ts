import { cohortCell, type CohortCell } from '@arpedia/core';

/** `staff_analytics_growth` (flow 15 rule 26, spec check 15-23). */
export interface Growth {
  /** Today in Lagos (YYYY-MM-DD). */
  today: string;
  cohorts: { week: string; size: number; d1: number; d7: number; d30: number }[];
  churn: {
    /** Null under 5 subscribers. */
    rate: number | null;
    previous: number | null;
    plans: { plan: string; subscribers: number | null; left: number; rate: number | null; reason: string | null }[];
  };
  promos: {
    code: string;
    kind: 'bonus_credits' | 'plan_discount' | 'trial_days';
    amount: number;
    started: number | null;
    paid: number | null;
    rate: number | null;
  }[];
}

export const EMPTY_GROWTH: Growth = {
  today: '',
  cohorts: [],
  churn: { rate: null, previous: null, plans: [] },
  promos: [],
};

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 5 Oct" */
export function weekLabel(week: string): string {
  const d = new Date(`${week}T00:00:00Z`);
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

export interface CohortRow {
  week: string;
  label: string;
  size: number;
  /** The week isn't over yet: "612 so far". */
  partial: boolean;
  cells: CohortCell[];
}

export const DAYS = [1, 7, 30] as const;

/** Retention rows, newest last, with each cell ready, too young ("Day 30 on 2 Dec") or too small. */
export function cohortRows(g: Growth): CohortRow[] {
  return g.cohorts
    .filter(c => c.size > 0)
    .map(c => {
      const end = new Date(Date.parse(`${c.week}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
      return {
        week: c.week,
        label: weekLabel(c.week),
        size: c.size,
        partial: g.today !== '' && g.today <= end,
        cells: DAYS.map(d => cohortCell(c.week, d, g.today, c.size, c[`d${d}`])),
      };
    });
}

/** Day 30 retention: the newest week whose day 30 is known, against the week before it. */
export function day30(rows: CohortRow[]): { pct: number; label: string; delta: { text: string; up: boolean } | null } | null {
  const ready = rows.filter(r => r.cells[2]!.state === 'ready');
  const last = ready.at(-1);
  if (!last) return null;
  const pctOf = (r: CohortRow) => (r.cells[2] as { pct: number }).pct;
  const prev = ready.at(-2);
  const d = prev ? pctOf(last) - pctOf(prev) : null;
  return {
    pct: pctOf(last),
    label: prev ? `vs ${prev.label} week` : `${last.label} week`,
    delta: d == null ? null : { text: `${d >= 0 ? '+' : ''}${d} pts`, up: d >= 0 },
  };
}

/** Churn change in points; falling churn is good, so it shows as "up". */
export function churnDelta(now: number | null, before: number | null): { text: string; up: boolean } | null {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  return { text: `${d > 0 ? '+' : ''}${d} pts`, up: d <= 0 };
}

/** "25% off a plan", "50 bonus credits", "7 free days". */
export function promoLabel(p: Pick<Growth['promos'][number], 'kind' | 'amount'>): string {
  if (p.kind === 'plan_discount') return `${p.amount}% off a plan`;
  if (p.kind === 'trial_days') return `${p.amount} free ${p.amount === 1 ? 'day' : 'days'}`;
  return `${p.amount.toLocaleString('en-NG')} bonus credits`;
}

/** `staff_analytics_imports` (flow 15 rule 26, spec check 15-21): the nightly store and PostHog import. */
export interface Imports {
  /** Installs in the period from the Play Console export; null when none were imported (or under 5). */
  installs: number | null;
  installs_previous: number | null;
  /** The last day the export covers (Play is a day or two behind). */
  installs_through: string | null;
  /** Null when no signup was imported for the period. */
  sources: { source: string; signups: number | null; share: number | null }[] | null;
  imported_at: string | null;
}

export const EMPTY_IMPORTS: Imports = {
  installs: null,
  installs_previous: null,
  installs_through: null,
  sources: null,
  imported_at: null,
};

/** Rule 26's sources, in the prototype's words. */
export const SOURCE_LABELS: Record<string, string> = {
  play_search: 'Play Store search',
  book_link: 'Shared book links',
  church: 'Church group referrals',
  instagram: 'Instagram',
  author_code: 'Author referral codes',
  unknown: 'Unknown',
};

/** Signups by source as bars: widths against the largest source, Unknown last and muted. */
export function sourceBars(
  sources: Imports['sources'],
): { label: string; share: number; signups: number | null; muted: boolean }[] {
  if (!sources?.length) return [];
  const top = Math.max(...sources.map(s => s.signups ?? 0), 1);
  return [...sources]
    .sort((a, b) => Number(a.source === 'unknown') - Number(b.source === 'unknown'))
    .map(s => ({
      label: SOURCE_LABELS[s.source] ?? 'Unknown',
      share: s.signups == null ? 0 : Math.round((100 * s.signups) / top),
      signups: s.signups,
      muted: s.source === 'unknown',
    }));
}
