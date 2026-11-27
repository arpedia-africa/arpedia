import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import { MIN_PAYOUT_KOBO, type StudioBookStatus } from '@arpedia/core';
import type { CoverTone } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '../01/session';

// Read models of the Author Studio (studio_home, studio_books, studio_earnings in the flow 11
// migration). All three are read-only RPCs over the ledger; the shapes below mirror their jsonb.

export const STUDIO_BOOKS = '/studio/books' as Href;
export const STUDIO_EARNINGS = '/studio/earnings' as Href;

/** One calendar month of an author's earnings (`_author_month`). */
export interface AuthorMonth {
  /** "2026-11" */
  month: string;
  credits: number;
  earned_kobo: number;
  unlock_all_credits: number;
  unlock_all_kobo: number;
  paygo_credits: number;
  paygo_kobo: number;
  tips_credits: number;
  tips_kobo: number;
  refund_kobo: number;
  /** Flow 13 payout for the month (studio_earnings history only). */
  payout?: MonthPayout;
}

/** A month's payout: the cycle's date (or the date settings give an open month) and its line. */
export interface MonthPayout {
  payout_date: string;
  closed: boolean;
  status: string | null;
  payable_kobo: number | null;
  carried: boolean;
  paid_at: string | null;
}

export interface StudioHome {
  pen_name: string;
  status: 'active' | 'suspended';
  suspended_reason: string | null;
  approved_at: string;
  show_approval_banner: boolean;
  month: AuthorMonth;
  books: { book_id: string; title: string; credits: number; earned_kobo: number }[];
  book_counts: { live: number; all: number; in_review: number; changes_requested: number; drafts: number };
  followers: number;
  minutes_read: number;
  club_group_id: string | null;
  payouts_paused: boolean;
  payout_account_status: 'not_set' | 'pending' | 'verified' | 'failed';
  min_payout_kobo: number;
  hold_days: number;
  payout_day: number;
  /** The earliest closed month waiting to be sent, or null. */
  next_payout: { month: string; payout_date: string; kobo: number; status: string } | null;
}

export interface StudioBook {
  book_id: string;
  title: string;
  book_status: string;
  updated_at: string;
  revision_id: string;
  revision_no: number;
  revision_status: string;
  /** book_revisions.draft_step (flow 12's enum); null outside a draft. */
  draft_step: 'upload' | 'converting' | 'checking' | 'chapters' | 'preview' | null;
  price_credits: number | null;
  live_revision_no: number | null;
  chapters: number;
  author_status: StudioBookStatus;
  issues: string[];
  unpublish_reason: string | null;
}

export interface StudioEarnings {
  month: AuthorMonth;
  history: AuthorMonth[];
  min_payout_kobo: number;
  kobo_per_credit: number;
  hold_days: number;
  payout_day: number;
}

const retry = (n: number, e: unknown) => n < 2 && isNetworkError(e);

export function useStudioHome(uid: string | undefined) {
  return useQuery({
    queryKey: ['studio-home', uid],
    enabled: !!uid,
    retry,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('studio_home');
      if (error) throw error;
      return data as unknown as StudioHome;
    },
  });
}

export function useStudioBooks(uid: string | undefined) {
  return useQuery({
    queryKey: ['studio-books', uid],
    enabled: !!uid,
    retry,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('studio_books');
      if (error) throw error;
      return data as unknown as StudioBook[];
    },
  });
}

export function useStudioEarnings(uid: string | undefined) {
  return useQuery({
    queryKey: ['studio-earnings', uid],
    enabled: !!uid,
    retry,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('studio_earnings', {});
      if (error) throw error;
      return data as unknown as StudioEarnings;
    },
  });
}

/** The author's own profile row (visibility for the Shortcuts pill). */
export function useAuthorProfile(uid: string | undefined) {
  return useQuery({
    queryKey: ['author-profile', uid],
    enabled: !!uid,
    retry,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('author_profiles')
        .select('pen_name, visibility, status, suspended_reason')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** The approval banner is dismissed once per phone (rule 9: a banner, not a system popup). */
export function useBannerDismissed(uid: string | undefined) {
  const key = `arpedia.studio.approved-banner.${uid ?? ''}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(key)
      .then((v) => setDismissed(v === '1'))
      .catch(() => {});
  }, [key, uid]);
  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(key, '1').catch(() => {});
  }, [key]);
  return [dismissed, dismiss] as const;
}

// ─── Formatting ─────────────────────────────────────────────────────────────
/** "41.2k", "3.4k", "860", "1.2m" for stats on the band. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}m`;
  if (n >= 1000) return `${trim(n / 1000)}k`;
  return String(n);
}
const trim = (x: number) => (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '');

export const num = (n: number) => n.toLocaleString('en-NG');

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "2026-10" → "October". */
export const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

/**
 * Payout of a month (flow 13 rules): released on the 15th after a 30-day hold, so October is
 * paid on 15 December. Flow 13 adds the real payout rows; until then the status comes from dates.
 */
export function payoutOf(m: AuthorMonth, today = new Date()) {
  const y = Number(m.month.slice(0, 4));
  const mo = Number(m.month.slice(5, 7)) - 1;
  const release = new Date(Date.UTC(y, mo + 2, 15));
  const label = `15 ${SHORT[release.getUTCMonth()]}`;
  const due = release.getTime() <= today.getTime();
  const below = m.earned_kobo < MIN_PAYOUT_KOBO;
  return { release, label, due, below };
}

/** The next month still waiting for its payout day, with something to pay. */
export function nextPayout(history: AuthorMonth[], today = new Date()) {
  return (
    [...history]
      .filter((m) => m.earned_kobo > 0 && !payoutOf(m, today).due)
      .sort((a, b) => a.month.localeCompare(b.month))[0] ?? null
  );
}

/** A stable sample cover tone per book (real covers come with flow 12's cover URLs). */
export function toneFor(id: string): CoverTone {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (['c1', 'c2', 'c4', 'c5', 'c6', 'c7', 'c8'] as const)[h % 7]!;
}

/** "2 live · 1 in review · 1 draft" (s-studio-books sub, My Books shortcut). */
export function bookCountsLine(c: StudioHome['book_counts'] | null, books?: StudioBook[]) {
  const counts = books
    ? {
        live: books.filter((b) => ['live', 'update_draft', 'update_in_review'].includes(b.author_status))
          .length,
        in_review: books.filter((b) => ['in_review', 'update_in_review'].includes(b.author_status)).length,
        changes: books.filter((b) => b.author_status === 'changes_requested').length,
        drafts: books.filter((b) => b.author_status === 'draft').length,
      }
    : c
      ? { live: c.live, in_review: c.in_review, changes: c.changes_requested, drafts: c.drafts }
      : null;
  if (!counts) return '';
  const parts = [`${counts.live} live`];
  if (counts.in_review) parts.push(`${counts.in_review} in review`);
  if (counts.changes) parts.push(`${counts.changes} to fix`);
  if (counts.drafts) parts.push(`${counts.drafts} draft${counts.drafts > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
