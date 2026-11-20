// Home data (docs/prd/02-discovery.md rules 1–8): one get_home call, cached for first paint and
// refreshed in the background, on foreground and every 60 seconds while Home is open.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { AvatarTone, CoverTone } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';

export interface HomeBook {
  id: string;
  title: string;
  author_id: string;
  author_name: string;
  genre: string;
  words: number | null;
  pages: number | null;
  price_credits: number;
  cover_key: string | null;
  rank?: number;
  prev_rank?: number | null;
}
export interface HomeAuthor {
  id: string;
  name: string;
  avatar_url: string | null;
}
export interface HomeGenre {
  id: string;
  name: string;
  slug: string;
  book_count: number;
}
export type HomeSection =
  | { key: 'trending' | 'new_arrivals' | 'top10' | 'recommended'; title: string; items: HomeBook[] }
  | { key: 'authors'; title: string; items: HomeAuthor[] }
  | { key: 'genres'; title: string; items: HomeGenre[] }
  | { key: 'coming_soon'; title: string; items: (HomeBook & { teaser: string | null })[] };
export interface HomeData {
  first_name: string | null;
  credits: number;
  unread: number;
  picks: string[];
  live_books: number;
  sections: HomeSection[];
}

export const homeKey = ['home'] as const;

export function useHome() {
  const q = useQuery({
    queryKey: homeKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_home', {});
      if (error) throw error;
      return data as unknown as HomeData;
    },
    // Rule 8: last session's data paints first, stale after 10 minutes. Rule 7: every 60 s.
    staleTime: 1000 * 60 * 10,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
  const { refetch } = q;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);
  return q;
}

const TONES: CoverTone[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
const AV_TONES: AvatarTone[] = ['m', 'r', 'o', 'k', 't'];
const hash = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Sample cover gradient for a book without a cover image (stable per book). */
export const coverTone = (id: string): CoverTone => TONES[hash(id) % TONES.length]!;
/** Avatar tone for a person without a photo (stable per person). */
export const avatarTone = (id: string): AvatarTone => AV_TONES[hash(id) % AV_TONES.length]!;

/** "Ifeoma Nwachukwu" → "Ifeoma N."; "Adaeze Rosemary Possible" → "Adaeze R. P." */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  if (!first) return '';
  return [first, ...rest.map((p) => `${p[0]!.toUpperCase()}.`)].join(' ');
}

/** Counts a shelf card tap by position for Discover curation (fire and forget). */
export function logShelfTap(sectionKey: string, position: number) {
  if (position < 0) return;
  void supabase.rpc('log_shelf_taps', { p_taps: [{ section_key: sectionKey, position }] }).then(
    () => {},
    () => {},
  );
}

/** Recommended subtitle (rule 5). */
export function picksLine(picks: string[]): string {
  if (picks.length === 0) return 'Popular with new readers';
  return `Because you picked ${picks.slice(0, 2).join(' and ')}`;
}
