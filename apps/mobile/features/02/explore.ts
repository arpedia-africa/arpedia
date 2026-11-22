// Top 10, Explore and the filter sheet data (docs/prd/02-discovery.md rules 9–17).
import { useEffect, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { hoursRead, movement, type LengthBand } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { coverTone, type HomeBook } from './home';
import type { GenreOption, ListBook, RankedBook, SortKey } from './ListViews';

const TEN_MIN = 1000 * 60 * 10;

/** "Christian romance · 13 hr read" (genre left out when the book has none). */
const meta = (b: HomeBook) =>
  [b.genre, b.words ? `${hoursRead(b.words)} hr read` : null].filter(Boolean).join(' · ');

export const listBook = (b: HomeBook): ListBook => ({
  id: b.id,
  title: b.title,
  author: b.author_name,
  meta: meta(b),
  credits: b.price_credits,
  tone: coverTone(b.id),
});

export function useTop10() {
  return useQuery({
    queryKey: ['top10'],
    queryFn: async (): Promise<RankedBook[]> => {
      const { data, error } = await supabase.rpc('get_top10');
      if (error) throw error;
      return (data as unknown as HomeBook[]).map((b) => ({
        ...listBook(b),
        rank: b.rank ?? 0,
        move: movement(b.rank ?? 0, b.prev_rank),
      }));
    },
    staleTime: TEN_MIN,
    refetchOnMount: 'always',
  });
}

/** Visible genres by book count (most first). */
export function useGenres() {
  return useQuery({
    queryKey: ['genre-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('genre_book_counts')
        .select('slug, name, book_count, position')
        .eq('visible', true)
        .order('book_count', { ascending: false })
        .order('position', { ascending: true });
      if (error) throw error;
      return data.map((g) => ({ slug: g.slug!, name: g.name!, count: g.book_count ?? 0 }));
    },
    staleTime: TEN_MIN,
  });
}

/** All + the top 5 visible genres by book count (Default Q2). */
export const chipGenres = (genres: GenreOption[], total: number, selected: string | null): GenreOption[] => {
  const top = genres.filter((g) => g.count > 0).slice(0, 5);
  // A genre picked elsewhere (Home tile, filter sheet) stays visible as a chip.
  const picked = genres.find((g) => g.slug === selected);
  if (picked && !top.some((g) => g.slug === picked.slug)) top.push(picked);
  return [{ slug: null, name: 'All', count: total }, ...top];
};

interface Page {
  items: HomeBook[];
  count: number;
  next: { k: number; id: string } | null;
}

export function useCatalogue(genre: string | null, bands: LengthBand[], sort: SortKey) {
  return useInfiniteQuery({
    queryKey: ['catalogue', genre, [...bands].sort(), sort],
    initialPageParam: null as Page['next'],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('list_books', {
        p_genre: genre ?? undefined,
        p_length_bands: bands.length ? bands : undefined,
        p_sort: sort,
        p_cursor: pageParam ?? undefined,
      });
      if (error) throw error;
      return data as unknown as Page;
    },
    getNextPageParam: (last) => last.next,
    placeholderData: keepPreviousData,
    staleTime: TEN_MIN,
  });
}

/** Live "Show N books" count, debounced 250 ms (rule 16). null while loading. */
export function useFilterCount(genre: string | null, bands: LengthBand[], enabled: boolean) {
  const key = `${genre ?? ''}|${[...bands].sort().join(',')}`;
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 250);
    return () => clearTimeout(t);
  }, [key]);
  const q = useQuery({
    queryKey: ['count-books', debounced],
    enabled,
    queryFn: async () => {
      const [g, b] = debounced.split('|');
      const { data, error } = await supabase.rpc('count_books', {
        p_genre: g || undefined,
        p_length_bands: b ? (b.split(',') as LengthBand[]) : undefined,
      });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
  return debounced === key && q.data != null ? q.data : null;
}
