import type { Supa } from '@/lib/money';
import type { CycleStatus } from '../shared';

export interface Line {
  id: string;
  author_id: string;
  name: string;
  book_credits: number;
  tip_message_credits: number;
  excluded_credits: number;
  amount_kobo: number;
  carry_in_kobo: number;
  adjustment_kobo: number;
  payable_kobo: number;
  status: 'payable' | 'carried' | 'held_unverified' | 'held_paused' | 'held_dispute' | 'queued' | 'paid' | 'partly_failed';
  held_reason: string | null;
  bank_account_id: string | null;
  bank_status: 'needs_review' | 'verified' | null;
  bank_paused: boolean;
}

export interface CycleDetail {
  id: string;
  month: string;
  status: CycleStatus;
  closed_at: string | null;
  hold_days: number | null;
  hold_ends_at: string | null;
  payout_date: string | null;
  credits_books: number;
  credits_tips_messages: number;
  earnings_kobo: number;
  net_revenue_kobo: number | null;
  prepared_by: string | null;
  prepared_at: string | null;
  prepared_name: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approved_name: string | null;
  min_payout_kobo: number | null;
  legacy: boolean;
  checks: {
    ledger_match: boolean;
    diff_kobo: number;
    hold_ended: boolean;
    sendable_kobo: number;
    flutterwave_balance_kobo: number | null;
    balance_ok: boolean;
    unverified: { author_id: string; payable_kobo: number }[];
    previous_failed: number;
  } | null;
  lines: Line[];
  exclusions: Partial<Record<'undone' | 'staff_return' | 'refund_clawback' | 'gift_loop' | 'self_read' | 'takedown', { credits: number; readers: number }>>;
  previous_failed: number;
  previous_failed_month: string | null;
  author_rate_kobo: number;
  /** Transfers waiting to be tried again after Flutterwave refused them (13-11). */
  retrying?: { count: number; next_at: string | null; kobo: number } | null;
}

export async function loadCycle(supabase: Supa, id: string) {
  const { data, error } = await supabase.rpc('admin_earning_cycle', { p_cycle: id });
  if (error) {
    if (error.code === '42501') return { denied: true as const };
    if (error.message === 'not_found' || error.code === '22P02') return { missing: true as const };
    throw error;
  }
  const cycle = data as unknown as CycleDetail;
  if (cycle.status === 'releasing' || cycle.status === 'paid_with_failures') {
    // Finance and Super admin only; anyone else simply sees no retry state.
    const { data: r } = await supabase.rpc('admin_cycle_retrying', { p_cycle: id });
    const retrying = r as unknown as CycleDetail['retrying'];
    cycle.retrying = retrying && retrying.count > 0 ? retrying : null;
  }
  return { cycle };
}

/** Lines that are paid (or will be) this run, held lines, and carried ones. */
export function groups(lines: Line[]) {
  const pays = lines.filter(l => ['payable', 'queued', 'paid', 'partly_failed'].includes(l.status));
  const held = lines.filter(l => l.status.startsWith('held_'));
  const carried = lines.filter(l => l.status === 'carried');
  // Verified accounts inside their 48-hour pause still pay in this run, a little later.
  const sendable = pays.filter(l => l.status === 'payable');
  return { pays, held, carried, sendable };
}

export const credits = (l: Pick<Line, 'book_credits' | 'tip_message_credits'>) => l.book_credits + l.tip_message_credits;
export const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

/** "Next month" for a cycle month ("2026-10-01" → "2026-11-01"). */
export function nextMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m!, 1));
  return d.toISOString().slice(0, 10);
}
