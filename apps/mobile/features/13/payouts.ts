// Flow 13 · the author's own payout account and monthly payout lines (RLS: own rows, masked columns).
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { PillTone } from '@arpedia/ui';
import { MIN_PAYOUT_KOBO, formatKobo } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '../01/session';

const api = process.env.EXPO_PUBLIC_API_URL ?? '';
const retry = (n: number, e: unknown) => n < 2 && isNetworkError(e);

export interface PayoutAccount {
  id: string;
  bank_name: string;
  account_last4: string;
  bank_account_name: string;
  status: 'needs_review' | 'verified' | 'rejected' | 'replaced';
  rejected_reason: string | null;
  document_requested_at: string | null;
  payouts_resume_at: string;
}

export const payoutAccountKey = (uid: string | undefined) => ['payout-account', uid] as const;

/** The author's live account (the newest that isn't replaced), or null. */
export function usePayoutAccount(uid: string | undefined) {
  return useQuery({
    queryKey: payoutAccountKey(uid),
    enabled: !!uid,
    retry,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('author_bank_accounts')
        .select(
          'id, bank_name, account_last4, bank_account_name, status, rejected_reason, document_requested_at, payouts_resume_at',
        )
        .eq('author_id', uid!)
        .neq('status', 'replaced')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PayoutAccount | null;
    },
  });
}

export interface PayoutLine {
  id: string;
  status:
    | 'payable'
    | 'carried'
    | 'held_unverified'
    | 'held_paused'
    | 'held_dispute'
    | 'queued'
    | 'paid'
    | 'partly_failed';
  payable_kobo: number;
  carried_to: string | null;
  earning_cycles: { month: string; status: string; payout_date: string | null } | null;
  payouts: {
    status: 'queued' | 'pending' | 'successful' | 'failed' | 'reversed';
    attempt: number;
    settled_at: string | null;
    author_bank_accounts: { bank_name: string; account_last4: string } | null;
  }[];
}

/** One line per closed month, newest first, keyed by "YYYY-MM". */
export function usePayoutLines(uid: string | undefined) {
  return useQuery({
    queryKey: ['payout-lines', uid],
    enabled: !!uid,
    retry,
    queryFn: async () => {
      // earning_cycles is staff-only (platform totals), so its month and payout day come from
      // my_earning_cycles() and are joined here.
      const [lines, cycles] = await Promise.all([
        supabase
          .from('author_earnings')
          .select(
            'id, cycle_id, status, payable_kobo, carried_to, payouts(status, attempt, settled_at, author_bank_accounts(bank_name, account_last4))',
          )
          .eq('author_id', uid!)
          .order('created_at', { ascending: false })
          .limit(24),
        supabase.rpc('my_earning_cycles'),
      ]);
      if (lines.error) throw lines.error;
      if (cycles.error) throw cycles.error;
      const cycleById = new Map((cycles.data ?? []).map((c) => [c.id, c]));
      const byMonth = new Map<string, PayoutLine>();
      for (const { cycle_id, ...l } of lines.data ?? []) {
        const c = cycleById.get(cycle_id);
        if (c) byMonth.set(c.month.slice(0, 7), { ...l, earning_cycles: c } as unknown as PayoutLine);
      }
      return byMonth;
    },
  });
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-12-15" or a timestamp → "15 Dec" (Lagos day). */
export function dayMonth(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(new Date(iso).getTime() + 3600_000);
  return `${d.getUTCDate()} ${SHORT[d.getUTCMonth()]}`;
}

export const accountLabel = (bank: string, last4: string) => `${bank} ···· ${last4}`;

/** Pill and sub line of one month in the Studio payout history (rule 28). */
export function lineStatus(
  l: PayoutLine,
  account: PayoutAccount | null,
  minPayoutKobo: number = MIN_PAYOUT_KOBO,
): { sub: string; pill: { label: string; tone: PillTone } } {
  const last = [...l.payouts].sort((a, b) => b.attempt - a.attempt)[0];
  const to =
    last?.author_bank_accounts ??
    (account ? { bank_name: account.bank_name, account_last4: account.account_last4 } : null);
  const toLine = to ? `To ${accountLabel(to.bank_name, to.account_last4)}` : 'Payout account not set up yet';
  const date = l.earning_cycles?.payout_date ? dayMonth(l.earning_cycles.payout_date) : null;
  switch (l.status) {
    case 'paid':
      return {
        sub: last?.settled_at ? `Paid ${dayMonth(last.settled_at)}` : 'Paid',
        pill: { label: 'Paid', tone: 'ok' },
      };
    case 'queued':
      return last && last.status !== 'queued'
        ? { sub: toLine, pill: { label: 'Sending', tone: 'warn' } }
        : { sub: toLine, pill: { label: date ? `Releases ${date}` : 'Queued', tone: 'warn' } };
    case 'payable':
      return { sub: toLine, pill: { label: date ? `Releases ${date}` : 'Payable', tone: 'warn' } };
    case 'carried':
      return {
        sub: `Under ${formatKobo(minPayoutKobo)} · adds to next month`,
        pill: { label: 'Carried', tone: 'grey' },
      };
    case 'held_unverified':
      return {
        sub: account ? 'Paid once your account is verified' : 'Add a payout account to get paid',
        pill: { label: 'Held', tone: 'warn' },
      };
    case 'held_paused':
    case 'held_dispute':
      return { sub: 'Held, needs review', pill: { label: 'Held', tone: 'warn' } };
    case 'partly_failed':
      return {
        sub: 'Transfer didn’t go through. We’ll send it again.',
        pill: { label: 'Failed', tone: 'err' },
      };
  }
}

/** The account's pill on s-studio-payout. */
export function accountStatus(a: PayoutAccount | null): { label: string; tone: PillTone } {
  if (!a) return { label: 'Not set', tone: 'grey' };
  if (a.status === 'verified') return { label: 'Verified', tone: 'ok' };
  if (a.status === 'rejected') return { label: 'Rejected', tone: 'err' };
  return { label: a.document_requested_at ? 'Document needed' : 'Checking', tone: 'warn' };
}

// ─── Bank change (rule 21) ──────────────────────────────────────────────────
export class BankError extends Error {}

const MESSAGES: Record<string, string> = {
  account_not_found: 'We couldn’t find that account. Check the bank and the number.',
  bank_unavailable: 'The bank isn’t answering right now. Try again in a few minutes.',
  unknown_bank: 'Choose your bank from the list.',
  not_configured: 'Adding a bank account isn’t available yet. Try again later.',
  not_an_author: 'Only approved authors can add a payout account.',
};

async function call<T>(path: string, body?: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !api) throw new BankError(MESSAGES.not_configured);
  const res = await fetch(`${api}/v1/earnings${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : null),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new BankError(MESSAGES[json.error ?? ''] ?? 'Something went wrong. Try again.');
  return json;
}

export function useBanks(enabled: boolean) {
  return useQuery({
    queryKey: ['banks'],
    enabled,
    staleTime: 24 * 3600_000,
    retry,
    queryFn: async () => (await call<{ banks: { code: string; name: string }[] }>('/banks')).banks,
  });
}

export const resolveAccount = (bank_code: string, account_number: string) =>
  call<{ bank_name: string; account_name: string }>('/bank-account/resolve', { bank_code, account_number });

export function useSaveAccount(uid: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bank_code: string; account_number: string }) =>
      call<{ status: string; auto_verified: boolean; payouts_resume_at: string }>('/bank-account', v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payoutAccountKey(uid) });
      void qc.invalidateQueries({ queryKey: ['payout-lines', uid] });
    },
  });
}
