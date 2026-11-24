// Search data (docs/prd/02-discovery.md rules 18–28): empty-state sections, suggestions, results,
// recent searches on this device, logging and book requests.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { isSearchable, normalizeQuery, type LengthBand } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import type { HomeBook } from './home';
import type { Scope } from './SearchViews';

/* ─── Recent searches (device only, up to 10) ────────────────────────────── */
export interface Recent {
  kind: 'query' | 'book' | 'author';
  label: string;
  id?: string;
}
const RECENT_KEY = 'arpedia.search.recent';
const MAX_RECENT = 10;

export function useRecent() {
  const [items, setItems] = useState<Recent[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => setItems(v ? (JSON.parse(v) as Recent[]) : []))
      .catch(() => setItems([]));
  }, []);
  const save = (next: Recent[]) => {
    setItems(next);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  };
  return {
    items,
    add: (r: Recent) => {
      const same = (x: Recent) =>
        x.kind === r.kind && (r.id ? x.id === r.id : normalizeQuery(x.label) === normalizeQuery(r.label));
      save([r, ...items.filter((x) => !same(x))].slice(0, MAX_RECENT));
    },
    clear: () => save([]),
  };
}

/* ─── Online state ───────────────────────────────────────────────────────── */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
    [],
  );
  return online;
}

/** Debounced value (suggestions wait 200 ms after the last letter). */
export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ─── Server reads ───────────────────────────────────────────────────────── */
export interface SearchHome {
  trending: { query: string; searchers: number; book_id: string | null; author_id: string | null }[];
  genres: { id: string; name: string; slug: string; book_count: number }[];
  authors: { id: string; name: string; avatar_url: string | null }[];
}

export function useSearchHome() {
  return useQuery({
    queryKey: ['search-home'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_search_home');
      if (error) throw error;
      return data as unknown as SearchHome;
    },
    staleTime: 1000 * 60 * 10,
  });
}

export type ServerSuggestion =
  | { type: 'book'; id: string; title: string; sub: string; cover_key: string | null; topic: string | null }
  | { type: 'author'; id: string; title: string; books: number; avatar_url: string | null }
  | { type: 'club'; id: string; title: string; members: number }
  | { type: 'genre'; id: string; slug: string; title: string; books: number };

export function useSuggest(q: string, enabled: boolean) {
  const query = normalizeQuery(useDebounced(q, 200));
  return useQuery({
    queryKey: ['suggest', query],
    enabled: enabled && isSearchable(query),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('suggest', { p_q: query });
      if (error) throw error;
      return data as unknown as ServerSuggestion[];
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export interface SearchResult {
  query: string;
  top: (HomeBook & { snippet: string | null; promoted: boolean }) | null;
  books: (HomeBook & { snippet: string | null; promoted: boolean })[];
  authors: { id: string; name: string; avatar_url: string | null; books: number }[];
  clubs: { id: string; name: string; members: number }[];
  counts: Record<Scope, number>;
}

export function useSearch(q: string | null, filters: { genre: string | null; bands: LengthBand[] }) {
  return useQuery({
    queryKey: ['search', q, filters.genre, [...filters.bands].sort()],
    enabled: q != null && isSearchable(q),
    queryFn: async () => {
      // Scope only filters what is drawn; one call returns every group and its count.
      const { data, error } = await supabase.rpc('search', {
        p_q: q!,
        p_scope: 'all',
        p_genre: filters.genre ?? undefined,
        p_length_bands: filters.bands.length ? filters.bands : undefined,
      });
      if (error) throw error;
      return data as unknown as SearchResult;
    },
    staleTime: 60_000,
  });
}

/** "You might like" on no results: the most read books overall (up to 3). */
export function useCloseMatches(enabled: boolean) {
  return useQuery({
    queryKey: ['close-matches'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_books', { p_sort: 'most_read', p_limit: 3 });
      if (error) throw error;
      return (data as unknown as { items: HomeBook[] }).items;
    },
    staleTime: 1000 * 60 * 10,
  });
}

/** Fire-and-forget search log (queries under 2 characters never leave the app). */
export function logSearch(q: string, resultCount: number, tapped?: { type: string; id: string }) {
  if (!isSearchable(q)) return;
  void supabase
    .rpc('log_search', {
      p_q: q,
      p_result_count: resultCount,
      p_tapped_type: tapped?.type,
      p_tapped_id: tapped?.id,
    })
    .then(
      () => {},
      () => {},
    );
}

export function useRequestBook() {
  return useMutation({
    mutationFn: async (q: string) => {
      const { data, error } = await supabase.rpc('request_book', { p_q: q });
      if (error) throw error;
      return data;
    },
  });
}
