// Flow 10 · Profile and settings: reading-goal status and pace, collection date labels, quiet
// hours, the name-change limit and the delete confirmation. The database checks the same rules
// again (set_reading_goal, update_profile, request_account_deletion).

export const GOAL_OPTIONS = [6, 12, 24, 52] as const;
export const GOAL_MIN = 1;
export const GOAL_MAX = 365;
export const PROFILE_BIO_MAX = 160;
/** Name changes allowed per 30 days (rule 28 default). */
export const NAME_CHANGES_PER_30_DAYS = 3;
/** Devices that may hold downloads (rule 31). */
export const DOWNLOAD_DEVICES = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Day of the year (1 on 1 January) for a `YYYY-MM-DD` date. */
export function dayOfYear(date: string): { year: number; day: number; days: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
  return { year: y, day, days: isLeap(y) ? 366 : 365 };
}

/** Today's date in Lagos as `YYYY-MM-DD`. */
export const lagosToday = (now: Date = new Date()) =>
  new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

export const validGoal = (n: number) => Number.isInteger(n) && n >= GOAL_MIN && n <= GOAL_MAX;

export type GoalStatus =
  | { kind: 'none' }
  | { kind: 'reached'; read: number; target: number }
  | { kind: 'on_track'; read: number; target: number; left: number }
  | { kind: 'behind'; read: number; target: number; left: number; behind: number };

/**
 * Rule 4: on track when read ≥ floor(target × days elapsed ÷ days in year), else "N behind";
 * reached when read ≥ target. `today` is the Lagos date (YYYY-MM-DD).
 */
export function goalStatus(read: number, target: number | null | undefined, today: string): GoalStatus {
  if (!target) return { kind: 'none' };
  if (read >= target) return { kind: 'reached', read, target };
  const { day, days } = dayOfYear(today);
  const expected = Math.floor((target * day) / days);
  const left = target - read;
  if (read >= expected) return { kind: 'on_track', read, target, left };
  return { kind: 'behind', read, target, left, behind: expected - read };
}

/** The band's line: "14 of 24 · 10 to go, on track". */
export function goalLine(s: GoalStatus): string {
  switch (s.kind) {
    case 'none':
      return 'Set a reading goal';
    case 'reached':
      return `${s.read} of ${s.target} · Goal reached`;
    case 'on_track':
      return `${s.read} of ${s.target} · ${s.left} to go, on track`;
    case 'behind':
      return `${s.read} of ${s.target} · ${s.left} to go, ${s.behind} behind`;
  }
}

/** Ring fill, 0 to 1 (full once reached; extra books keep counting in the text). */
export const goalProgress = (read: number, target: number | null | undefined) =>
  target ? Math.min(1, Math.max(0, read / target)) : 0;

/** Rule 8: "24 books is about 2 a month. You've read 14 so far." */
export function paceHint(target: number, read: number): string {
  const books = `${target} ${target === 1 ? 'book' : 'books'}`;
  const pace =
    target >= 12
      ? `about ${Math.round(target / 12)} a month`
      : `about 1 every ${Math.round(12 / target)} months`;
  return `${books} is ${pace}. You've read ${read} so far.`;
}

/** Rule 11: "10 Nov", with the year when it isn't this (Lagos) year. */
export function dateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS);
  const thisYear = new Date(now.getTime() + LAGOS_OFFSET_MS).getUTCFullYear();
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === thisYear ? base : `${base} ${d.getUTCFullYear()}`;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Whether `time` (HH:MM) falls in quiet hours from `start` to `end`, which may cross midnight. */
export function inQuietHours(time: string, start = '22:00', end = '06:00'): boolean {
  const t = minutes(time);
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Name changes still allowed, given the times of earlier changes. */
export function nameChangesLeft(changes: readonly string[], now: Date = new Date()): number {
  const since = now.getTime() - 30 * 86_400_000;
  const recent = changes.filter((c) => new Date(c).getTime() > since).length;
  return Math.max(0, NAME_CHANGES_PER_30_DAYS - recent);
}

/** Rule 35: exactly DELETE, any case. */
export const deleteConfirmed = (text: string) => text.trim().toUpperCase() === 'DELETE';
