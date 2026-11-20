import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onlineManager, useQuery } from '@tanstack/react-query';
import {
  compactCount,
  mainButton,
  perChapter,
  ratingBars,
  ratingLabel,
  readTimeShort,
  type PlanState,
} from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { avatarTone, coverTone, type BookPageModel } from './BookViews';

// get_book_page (supabase/migrations/20261119000000_03_unlock.sql): one round trip per book page.

interface ReviewJson {
  id: string;
  user_id: string;
  name: string | null;
  stars: number;
  body: string | null;
  spoiler: boolean;
  likes: number;
  liked: boolean;
  mine: boolean;
  created_at: string;
}

export interface BookPageData {
  book: {
    id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    genres: string[] | null;
    tags: string[] | null;
    status: string;
    cover_key: string | null;
    author: { id: string; name: string | null };
  };
  coming_soon: boolean;
  pages: number | null;
  words: number | null;
  read_minutes: number;
  price: number;
  chapters: number;
  chargeable_chapters: number;
  per_chapter: number | null;
  preview_percent: number;
  rating: { avg: number | null; count: number; h: number[] } | null;
  reads: number;
  comments: number;
  top_review: ReviewJson | null;
  my_review: ReviewJson | null;
  owns_book: boolean;
  paid_credits: number;
  remaining: number;
  first_unpaid: { ord: number; chapter_uid: string; price: number } | null;
  unpaid_prices: number[];
  progress: {
    percent: number;
    max_percent: number;
    chapter_ord: number | null;
    finished_at: string | null;
  } | null;
  balance: number;
  plan: { state: PlanState; status?: string; plan_code?: string; period_end?: string };
  following: boolean;
  is_author: boolean;
  related: { id: string; title: string; author: string | null; owned: boolean }[];
}

export const bookKey = (id: string) => ['book-page', id] as const;

/**
 * The book page. React Native has no window focus, so it refetches when the screen regains focus
 * (back from the reader) and when the app returns to the foreground, so a purchase on another
 * device shows (edge cases).
 */
export function useBookPage(id: string) {
  const q = useQuery({
    queryKey: bookKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_book_page', { p_book: id });
      if (error) throw error;
      return data as unknown as BookPageData | null;
    },
  });
  const { refetch } = q;
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) first.current = false;
      else void refetch();
    }, [refetch]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);
  return q;
}

/** Live connection state (re-renders when it changes; `onlineManager.isOnline()` alone doesn't). */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
}

export function toModel(d: BookPageData): BookPageModel {
  const meta = [
    d.book.genres?.[0] ?? null,
    d.pages ? `${d.pages.toLocaleString('en-NG')} pages` : null,
    d.read_minutes > 0 ? readTimeShort(d.read_minutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const count = d.rating?.count ?? 0;
  const paid = d.paid_credits > 0;
  const top = d.top_review;
  return {
    title: d.book.title,
    author: d.book.author.name ?? '',
    tone: coverTone(d.book.id),
    following: d.following,
    meta,
    rating: d.rating?.avg != null && count > 0 ? ratingLabel(Number(d.rating.avg)) : null,
    reads: compactCount(d.reads),
    comments: compactCount(d.comments),
    mainLabel: mainButton({
      comingSoon: d.coming_soon,
      percent: d.progress?.percent ?? null,
      maxPercent: d.progress?.max_percent ?? null,
      previewPercent: Number(d.preview_percent),
      owned: d.owns_book,
    }),
    buy:
      d.owns_book || d.coming_soon || d.is_author
        ? null
        : paid
          ? { kind: 'rest', paid: d.paid_credits, price: d.price, left: d.remaining, balance: d.balance }
          : {
              kind: 'options',
              price: d.price,
              perChapter: d.per_chapter ?? perChapter(d.price, d.chargeable_chapters),
              balance: d.balance,
            },
    owned: d.owns_book,
    description: d.book.description ?? '',
    tags: d.book.tags ?? [],
    reviewCount: count,
    bars: ratingBars(d.rating?.h ?? [], count),
    topReview:
      top && top.body
        ? {
            id: top.id,
            name: top.name ?? 'Reader',
            stars: top.stars,
            body: top.body,
            tone: avatarTone(top.user_id),
          }
        : null,
    discussionOpen: (d.progress?.max_percent ?? 0) >= 95,
    related: d.related.map((b) => ({ id: b.id, title: b.title, author: b.author ?? '' })),
  };
}
