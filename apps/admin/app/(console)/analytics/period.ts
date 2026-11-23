/** Insights period (rule 24): 7, 30 or 90 days or This year, in WAT, against the previous period of the same length. */
export type PeriodKey = '7' | '30' | '90' | 'year';

export interface Period {
  key: PeriodKey;
  from: string;
  to: string;
  days: number;
  /** "the last 30 days", "this year". */
  label: string;
}

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'year', label: 'This year' },
];

const TZ = 'Africa/Lagos';
const DAY = 86_400_000;

/** Today's date in WAT as YYYY-MM-DD. */
export const todayWat = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function period(raw?: string): Period {
  const key: PeriodKey = raw === '30' || raw === '90' || raw === 'year' ? raw : '7';
  const to = todayWat();
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const from = key === 'year' ? `${to.slice(0, 4)}-01-01` : iso(toMs - (Number(key) - 1) * DAY);
  const days = Math.round((toMs - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  return { key, from, to, days, label: key === 'year' ? 'this year' : `the last ${key} days` };
}

/** Every day of the period, oldest first. */
export function daysOf(p: Period): string[] {
  const start = Date.parse(`${p.from}T00:00:00Z`);
  return Array.from({ length: p.days }, (_, i) => iso(start + i * DAY));
}
