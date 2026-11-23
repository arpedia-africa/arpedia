import 'server-only';
import { serverSupabase } from '@/lib/supabase/server';
import { daysOf, type Period } from './period';
import type { Bucket, Kpi } from './shared';

/** One metric from `staff_analytics`: daily rows (null value = fewer than 5 people) and period totals. */
export interface Metric {
  series: { day: string; dim: Record<string, string | number>; value: number | null }[];
  total: number | null;
  previous: number | null;
}
export type Metrics = Record<string, Metric | undefined>;

export async function metrics(names: string[], p: Period): Promise<{ data: Metrics; error: boolean }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_analytics', { p_metrics: names, p_from: p.from, p_to: p.to });
  return { data: (data as unknown as Metrics | null) ?? {}, error: !!error };
}

export const num = (n: number) => Math.round(n).toLocaleString('en-NG');
export const dash = '—';

/** Value for display; groups under 5 people never show (rule 28). */
export const count = (n: number | null | undefined, small = false) =>
  n == null ? (small ? 'Fewer than 5' : dash) : n > 0 && n < 5 ? 'Fewer than 5' : num(n);

/** Percentage change against the previous period, or null when there is nothing to compare. */
export function change(now: number | null | undefined, before: number | null | undefined): Kpi['delta'] {
  if (now == null || !before) return null;
  const d = ((now - before) / before) * 100;
  return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, up: d >= 0 };
}

const fmt = (day: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(new Date(`${day}T00:00:00Z`));

/**
 * Chart columns for the period: one per day up to 31 days, then one per week (90 days) or month
 * (This year). Each column is the average day in it, so readers per day reads the same at any length.
 */
export function buckets(p: Period, data: Metrics, keys: string[]): Bucket[] {
  const days = daysOf(p);
  const byDay = Object.fromEntries(
    keys.map(k => [k, new Map((data[k]?.series ?? []).map(r => [r.day, r.value]))]),
  ) as Record<string, Map<string, number | null>>;
  const groups: string[][] = [];
  if (p.days <= 31) days.forEach(d => groups.push([d]));
  else if (p.key === 'year') {
    for (const d of days) {
      const last = groups.at(-1);
      if (last && last[0]!.slice(0, 7) === d.slice(0, 7)) last.push(d);
      else groups.push([d]);
    }
  } else for (let i = 0; i < days.length; i += 7) groups.push(days.slice(i, i + 7));

  let shownMonth = '';
  return groups.map((g, i) => {
    const values: Record<string, number | null> = {};
    for (const k of keys) {
      const vals = g.map(d => byDay[k]!.get(d));
      values[k] = vals.some(x => x === null) && vals.every(x => !x) ? null : vals.reduce<number>((a, x) => a + (x ?? 0), 0) / g.length;
    }
    const first = g[0]!;
    const now = i === groups.length - 1;
    const label = p.days <= 31 ? fmt(first, { weekday: 'short', day: 'numeric', month: 'short' }) : `${p.key === 'year' ? fmt(first, { month: 'long' }) : `Week of ${fmt(first, { day: 'numeric', month: 'short' })}`}`;
    let axis = '';
    if (p.days <= 31) {
      // First day, every 7th and Today, as "14 Oct · 21 · 28 · 4 Nov · Today".
      if (now) axis = 'Today';
      else if (i % 7 === 0 && (i === 0 || groups.length - 1 - i >= 3)) {
        const month = first.slice(0, 7);
        axis = fmt(first, month === shownMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
        shownMonth = month;
      }
    } else if (p.key === 'year') axis = fmt(first, { month: 'short' });
    else if (i === 0 || i % 3 === 0) axis = fmt(first, { day: 'numeric', month: 'short' });
    return { label, axis, values, now };
  });
}
