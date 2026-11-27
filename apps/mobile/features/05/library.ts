// Library data (rules 1–11, 26–35): get_library pages per shelf, the books on this phone, and the
// local state that must answer offline. The mirror is the persisted TanStack cache (src/lib/query):
// the screen paints from it at once, offline included, then fetches changes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  onlineManager,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { compareItems, type LibraryItem, type LibrarySort, type Shelf } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { BookFiles, offlineBooks, removeDownload, type OfflineBook } from '../04/bookfiles';
import { readerKey, type ReaderState } from '../04/state';

export type AccountShelf = Exclude<Shelf, 'offline'>;
export const ACCOUNT_SHELVES: AccountShelf[] = ['reading', 'saved', 'finished'];
export const PAGE_SIZE = 24;

export interface LibraryPage {
  items: LibraryItem[];
  counts: Record<AccountShelf, number>;
  next: { k: string; id: string } | null;
}
type Pages = InfiniteData<LibraryPage, LibraryPage['next']>;

export const libraryKey = (shelf: AccountShelf, sort: LibrarySort) => ['library', shelf, sort] as const;
export const offlineKey = ['library-offline'] as const;

// ─── Local UI state ─────────────────────────────────────────────────────────
// The view and sort are kept on the phone (rule 8, Done when: "toggle, filter and sort persist").
// The shelf is kept for the session only: a cold start opens Reading (rule 1).
interface LibraryPrefs {
  view: 'grid' | 'list';
  sort: LibrarySort;
  setView: (v: 'grid' | 'list') => void;
  setSort: (s: LibrarySort) => void;
}
export const useLibraryPrefs = create<LibraryPrefs>()(
  persist(
    (set) => ({
      view: 'grid',
      sort: 'last_opened',
      setView: (view) => set({ view }),
      setSort: (sort) => set({ sort }),
    }),
    { name: 'arpedia.library', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

interface LibrarySession {
  shelf: Shelf;
  setShelf: (s: Shelf) => void;
  /** Downloads in flight on this phone: percent, or 'paused' after a failure (rule 27). */
  downloads: Record<string, number | 'paused'>;
  setDownload: (id: string, v: number | 'paused' | null) => void;
}
export const useLibrarySession = create<LibrarySession>()((set) => ({
  shelf: 'reading',
  setShelf: (shelf) => set({ shelf }),
  downloads: {},
  setDownload: (id, v) =>
    set((st) => {
      const downloads = { ...st.downloads };
      if (v == null) delete downloads[id];
      else downloads[id] = v;
      return { downloads };
    }),
}));

// ─── Shelves ────────────────────────────────────────────────────────────────
async function fetchPage(shelf: AccountShelf, sort: LibrarySort, after: LibraryPage['next']) {
  const { data, error } = await supabase.rpc('get_library', {
    p_shelf: shelf,
    p_sort: sort,
    p_after: after ?? undefined,
    p_limit: PAGE_SIZE,
  });
  if (error) throw error;
  return data as unknown as LibraryPage;
}

/** One account shelf, 24 books a page (rule 35), shown from the mirror first (rule 33). */
export function useShelf(shelf: AccountShelf, sort: LibrarySort) {
  return useInfiniteQuery({
    queryKey: libraryKey(shelf, sort),
    queryFn: ({ pageParam }) => fetchPage(shelf, sort, pageParam),
    initialPageParam: null as LibraryPage['next'],
    getNextPageParam: (last) => last.next,
    staleTime: 0,
  });
}

/** Every book of a shelf query, in order, without repeats (a book can move between pages). */
export function shelfItems(d: { pages: LibraryPage[] } | undefined): LibraryItem[] {
  const seen = new Set<string>();
  const out: LibraryItem[] = [];
  for (const p of d?.pages ?? [])
    for (const i of p.items)
      if (!seen.has(i.book_id)) {
        seen.add(i.book_id);
        out.push(i);
      }
  return out;
}

/** Newest counts any shelf query returned (counts are computed once per call). */
function latestCounts(qc: QueryClient): Record<AccountShelf, number> | null {
  let best: { at: number; counts: Record<AccountShelf, number> } | null = null;
  for (const [key, d] of qc.getQueriesData<Pages>({ queryKey: ['library'] })) {
    const counts = d?.pages[0]?.counts;
    const at = qc.getQueryState(key)?.dataUpdatedAt ?? 0;
    if (counts && (!best || at > best.at)) best = { at, counts };
  }
  return best?.counts ?? null;
}

/** Every book in the mirror, across shelves and sorts (search, rule 9; offline join, rule 5). */
export function mirrorBooks(qc: QueryClient): Map<string, LibraryItem> {
  const m = new Map<string, LibraryItem>();
  const entries = qc
    .getQueriesData<Pages>({ queryKey: ['library'] })
    .map(([key, d]) => ({ d, at: qc.getQueryState(key)?.dataUpdatedAt ?? 0 }))
    .sort((a, b) => a.at - b.at);
  // Older queries first so the newest copy of a book wins.
  for (const { d } of entries) for (const i of shelfItems(d)) m.set(i.book_id, i);
  return m;
}

/**
 * All three account shelves for the current sort (chips need every count, search needs every
 * book), refetched when the screen regains focus (counts follow the reader, rule 7).
 */
export function useLibrary(sort: LibrarySort) {
  const qc = useQueryClient();
  const reading = useShelf('reading', sort);
  const saved = useShelf('saved', sort);
  const finished = useShelf('finished', sort);
  const shelves = { reading, saved, finished };

  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: offlineKey });
    }, [qc]),
  );

  const counts = latestCounts(qc);
  return { shelves, counts };
}

// ─── Offline shelf (device only, rules 5, 26–31) ────────────────────────────
export interface OfflineEntry extends OfflineBook {
  item: LibraryItem | null;
  title: string;
  author: string | null;
}

/** Books with chapter files on this phone, joined with the mirror (or the reader's cached state). */
export function useOfflineShelf() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: offlineKey,
    queryFn: offlineBooks,
    networkMode: 'always',
    staleTime: 0,
    // Device facts: never written to the persisted mirror, always read from the files.
    gcTime: 0,
  });
  const data = q.data;
  // Titles come from the library mirror, which can arrive after the files are listed (after a fresh
  // sign-in the cache is empty): recompute when a library page lands, or rows stay "Downloaded book".
  const [mirrorVersion, setMirrorVersion] = useState(0);
  useEffect(
    () =>
      qc.getQueryCache().subscribe((e) => {
        if (e.type === 'updated' && e.action.type === 'success' && e.query.queryKey[0] === 'library')
          setMirrorVersion((v) => v + 1);
      }),
    [qc],
  );
  const entries = useMemo<OfflineEntry[]>(() => {
    const mirror = mirrorBooks(qc);
    return (data ?? [])
      .map((b) => {
        const item = mirror.get(b.bookId) ?? null;
        const st = qc.getQueryData<ReaderState>(readerKey(b.bookId));
        return {
          ...b,
          item,
          title: item?.title ?? st?.book.title ?? 'Downloaded book',
          author: item?.author_name ?? st?.book.author.name ?? null,
        };
      })
      .sort((a, b) => b.downloadedAt - a.downloadedAt);
    // mirrorVersion: re-read the mirror when it changes (see above).
  }, [data, qc, mirrorVersion]);
  return { ...q, entries };
}

/** Rule 29: refresh licences in the background when online. A failure leaves the licence as is. */
export async function refreshLicence(b: OfflineBook): Promise<boolean> {
  const f = new BookFiles(b.bookId, b.revisionId, false);
  try {
    await f.refreshKeys();
    return true;
  } catch {
    return false;
  }
}

export function useLicenceRefresh(entries: OfflineEntry[], onDone: (ok: boolean) => void) {
  const qc = useQueryClient();
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!onlineManager.isOnline()) return;
    // Refresh what has under two days left, once per book per session.
    const due = entries.filter(
      (e) => !tried.current.has(e.bookId) && (e.validUntil ?? 0) - Date.now() < 2 * 86_400_000,
    );
    if (due.length === 0) return;
    due.forEach((e) => tried.current.add(e.bookId));
    void Promise.all(due.map(refreshLicence)).then((r) => {
      onDone(r.every(Boolean));
      void qc.invalidateQueries({ queryKey: offlineKey });
    });
  }, [entries, onDone, qc]);
}

/**
 * Download for offline (cover menu, rule 14; after Pay the rest, rule 21): the files the reader is
 * entitled to (whole book when owned), sealed as received. Progress shows on the Offline shelf.
 */
export async function downloadBook(qc: QueryClient, bookId: string): Promise<void> {
  const { setDownload } = useLibrarySession.getState();
  setDownload(bookId, 0);
  try {
    const { data, error } = await supabase.rpc('get_reader_state', { p_book: bookId });
    if (error) throw error;
    const st = data as unknown as ReaderState;
    qc.setQueryData(readerKey(bookId), st);
    const f = new BookFiles(bookId, st.revision.id, st.owns_book || st.is_author);
    await f.downloadAll((done, total) => setDownload(bookId, Math.floor((done / total) * 100)));
    setDownload(bookId, null);
  } catch {
    setDownload(bookId, 'paused');
  } finally {
    void qc.invalidateQueries({ queryKey: offlineKey });
  }
}

/** Remove download (rule 14): this phone's files and keys only; unlocks stay. */
export function removeBookDownload(qc: QueryClient, bookId: string) {
  removeDownload(bookId);
  useLibrarySession.getState().setDownload(bookId, null);
  qc.setQueryData<OfflineBook[]>(offlineKey, (old) => old?.filter((b) => b.bookId !== bookId));
}

// ─── Save / Remove from Saved, queued offline (States: Offline) ─────────────
const PENDING = 'library.pending-ops';
interface PendingOp {
  op: 'save' | 'unsave';
  book_id: string;
}

async function loadOps(): Promise<PendingOp[]> {
  const raw = await AsyncStorage.getItem(PENDING).catch(() => null);
  return raw ? (JSON.parse(raw) as PendingOp[]) : [];
}
const saveOps = (ops: PendingOp[]) =>
  AsyncStorage.setItem(PENDING, JSON.stringify(ops)).catch(() => undefined);

async function sendOp(o: PendingOp) {
  const { error } = await supabase.rpc(o.op === 'save' ? 'save_book' : 'unsave_book', { p_book: o.book_id });
  if (error) throw error;
}

let flushing = false;
/** Send queued saves in order; a network failure keeps the rest for the next reconnect. */
export async function flushPendingOps(qc: QueryClient) {
  if (flushing || !onlineManager.isOnline()) return;
  flushing = true;
  try {
    let ops = await loadOps();
    while (ops.length > 0) {
      try {
        await sendOp(ops[0]!);
      } catch (e) {
        // A refusal (e.g. not_available) is dropped; only a missing connection waits.
        if (!(e as { code?: string })?.code) break;
      }
      ops = ops.slice(1);
      await saveOps(ops);
    }
    void qc.invalidateQueries({ queryKey: ['library'] });
  } finally {
    flushing = false;
  }
}

/** Flush the queue on launch and whenever the phone reconnects. */
export function usePendingOpsSync() {
  const qc = useQueryClient();
  useEffect(() => {
    void flushPendingOps(qc);
    return onlineManager.subscribe((online) => {
      if (online) void flushPendingOps(qc);
    });
  }, [qc]);
}

/** Apply a save/unsave to the mirror at once (rule 7), then send it or queue it. */
export async function setSaved(qc: QueryClient, item: LibraryItem, on: boolean) {
  for (const [key, d] of qc.getQueriesData<Pages>({ queryKey: ['library'] })) {
    if (!d) continue;
    const shelf = key[1] as AccountShelf;
    const sort = key[2] as LibrarySort;
    const had = shelfItems(d).some((i) => i.book_id === item.book_id);
    const pages = d.pages.map((p, n) => {
      let items = p.items.map((i) =>
        i.book_id === item.book_id ? { ...i, shelves: { ...i.shelves, saved: on } } : i,
      );
      if (shelf === 'saved' && !on) items = items.filter((i) => i.book_id !== item.book_id);
      if (shelf === 'saved' && on && !had && n === 0)
        items = [...items, { ...item, shelves: { ...item.shelves, saved: true } }].sort(
          compareItems('saved', sort),
        );
      const delta = on === item.shelves.saved ? 0 : on ? 1 : -1;
      return { ...p, items, counts: { ...p.counts, saved: Math.max(0, p.counts.saved + delta) } };
    });
    qc.setQueryData<Pages>(key, { ...d, pages });
  }
  const op: PendingOp = { op: on ? 'save' : 'unsave', book_id: item.book_id };
  if (onlineManager.isOnline()) {
    try {
      await sendOp(op);
      return;
    } catch (e) {
      if ((e as { code?: string })?.code) {
        void qc.invalidateQueries({ queryKey: ['library'] });
        throw e;
      }
    }
  }
  const ops = (await loadOps()).filter((o) => o.book_id !== item.book_id);
  await saveOps([...ops, op]);
}

/**
 * A progress change in the reader, applied to the mirror at once (rule 34, chip counts rule 7):
 * percent, chapter and last opened on every shelf, the book joins Reading, and each shelf keeps its
 * sort order. The server copy replaces it on the next refetch.
 */
export function applyProgress(
  qc: QueryClient,
  bookId: string,
  p: { percent: number; chapter_uid: string | null; at?: string },
) {
  const known = mirrorBooks(qc).get(bookId);
  if (!known) return;
  const at = p.at ?? new Date().toISOString();
  const next: LibraryItem = {
    ...known,
    percent: p.percent,
    max_percent: Math.max(known.max_percent, p.percent),
    chapter_uid: p.chapter_uid ?? known.chapter_uid,
    last_opened_at: at,
    shelves: { ...known.shelves, reading: known.shelves.reading || !known.shelves.finished },
  };
  const joinsReading = next.shelves.reading && !known.shelves.reading;
  for (const [key, d] of qc.getQueriesData<Pages>({ queryKey: ['library'] })) {
    if (!d) continue;
    const shelf = key[1] as AccountShelf;
    const sort = key[2] as LibrarySort;
    const had = shelfItems(d).some((i) => i.book_id === bookId);
    const pages = d.pages.map((pg, n) => {
      let items = pg.items.map((i) => (i.book_id === bookId ? next : i));
      if (shelf === 'reading' && joinsReading && !had && n === 0) items = [...items, next];
      items = items.sort(compareItems(shelf, sort));
      const counts = joinsReading ? { ...pg.counts, reading: pg.counts.reading + 1 } : pg.counts;
      return { ...pg, items, counts };
    });
    qc.setQueryData<Pages>(key, { ...d, pages });
  }
}

/** Toggle (rule 8): on the phone first, then profiles.library_view (best effort). */
export function saveView(view: 'grid' | 'list') {
  useLibraryPrefs.getState().setView(view);
  void supabase.rpc('set_library_view', { p_view: view }).then(
    () => undefined,
    () => undefined,
  );
}
