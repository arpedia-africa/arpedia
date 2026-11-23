// Shared bits of the flow 13 payout screens (author earnings, transfers, bank accounts).

export const n0 = (n: number) => Number(n).toLocaleString('en-NG');

export { AUTO_VERIFY_SCORE as AUTO_VERIFY } from '@arpedia/core';

const LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const lagos = (at: string | number | Date) => {
  const s = typeof at === 'string' && at.length === 10 ? `${at}T12:00:00Z` : at;
  return new Date(new Date(s).getTime() + 3_600_000);
};

/** "2026-10-01" → "October 2026"; `short` → "Oct 2026"; `bare` → "October". */
export function monthLabel(month: string, opt: { short?: boolean; bare?: boolean } = {}) {
  const [y, m] = month.split('-').map(Number);
  const name = LONG[(m ?? 1) - 1] ?? '';
  if (opt.bare) return name;
  return `${opt.short ? name.slice(0, 3) : name} ${y}`;
}

/** "15 Nov", with the year when it isn't this year ("15 Jan 2027"). */
export function day(at: string | number | Date, now = Date.now()) {
  const d = lagos(at);
  const year = d.getUTCFullYear() !== lagos(now).getUTCFullYear() ? ` ${d.getUTCFullYear()}` : '';
  return `${d.getUTCDate()} ${LONG[d.getUTCMonth()]!.slice(0, 3)}${year}`;
}

/** "Saturday 15 November". */
export const longDay = (at: string | number | Date) => {
  const d = lagos(at);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${LONG[d.getUTCMonth()]}`;
};

/** "11 Nov, 16:20". */
export const dayTime = (at: string | number | Date) => {
  const d = lagos(at);
  return `${day(at)}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export const past = (at: string | null | undefined) => !!at && new Date(at).getTime() <= Date.now();

export type CycleStatus = 'open' | 'closed' | 'prepared' | 'approved' | 'releasing' | 'paid' | 'paid_with_failures';

/** The month's status pill (`st` classes: only states needing attention are coloured). */
export function cycleStatus(status: CycleStatus, failed: number): { label: string; cls: string } {
  switch (status) {
    case 'open':
      return { label: 'Open, adding up', cls: 'st-plain' };
    case 'closed':
      return { label: 'Ready to release', cls: 'st st-org' };
    case 'prepared':
    case 'approved':
      return { label: 'Prepared, needs approval', cls: 'st st-org' };
    case 'releasing':
      return { label: 'Sending', cls: 'st st-warn' };
    case 'paid_with_failures':
      return { label: `Paid, ${failed} failed`, cls: 'st st-warn' };
    default:
      return failed ? { label: `Paid, ${failed} failed`, cls: 'st st-warn' } : { label: 'Paid', cls: 'st-plain' };
  }
}

/** The bank column of an author line. */
export function bankLabel(l: { status: string; bank_status: string | null; bank_paused: boolean }) {
  if (l.status === 'held_paused') return { label: 'Held, paused', cls: 'st st-warn' };
  if (l.status === 'held_dispute') return { label: 'Held, needs review', cls: 'st st-warn' };
  if (l.bank_status === 'needs_review') return { label: 'Held, needs review', cls: 'st st-warn' };
  if (!l.bank_status) return { label: 'Held, not verified', cls: 'st st-warn' };
  if (l.bank_paused) return { label: 'Verified, 48-hour pause', cls: 'st-plain' };
  return { label: 'Verified', cls: '' };
}

/** The error text for a failed payout RPC: staff see why, never a raw database message. */
export function payoutError(e: { code?: string; message: string }, map: Record<string, string>, fallback: string) {
  if (e.message === 'two_step_required') return 'Enter a fresh 2-step code to do this.';
  if (e.code === '42501') return map['42501'] ?? "Your role can't do this.";
  return map[e.message] ?? fallback;
}
