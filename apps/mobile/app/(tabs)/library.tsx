import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Share, View, type NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  bookTimeLeft,
  formatMB,
  matchesQuery,
  offlineLine,
  paymentLine,
  type LibraryItem,
  type LibrarySort,
} from '@arpedia/core';
import { Screen, Sheet, useTheme, useToast } from '@arpedia/ui';
import { coverTone } from '../../features/03/BookViews';
import { useOnline } from '../../features/03/book';
import { MenuBody } from '../../features/03/MoreSheet';
import type { UnlockMode } from '../../features/03/UnlockViews';
import { useTrack } from '../../features/05/analytics';
import {
  ACCOUNT_SHELVES,
  downloadBook,
  refreshLicence,
  removeBookDownload,
  saveView,
  setSaved,
  shelfItems,
  useLibrary,
  useLibraryPrefs,
  useLibrarySession,
  useLicenceRefresh,
  useOfflineShelf,
  usePendingOpsSync,
  type AccountShelf,
  type OfflineEntry,
} from '../../features/05/library';
import { FilterSheet, LibraryUnlock, PayRestLibSheet, coverMenu } from '../../features/05/LibrarySheets';
import {
  GridSkeleton,
  LibGrid,
  LibList,
  LibraryError,
  LibraryHero,
  ListSkeleton,
  OfflineNote,
  PageSkeleton,
  RefreshBanner,
  SHELF_LABEL,
  ShelfChips,
  ShelfEmpty,
  ShelfHead,
  type GridBook,
  type RowBook,
  type ShelfName,
} from '../../features/05/LibraryViews';

const n = (v: number) => v.toLocaleString('en-NG');
const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long' });
const SORT_SUB: Record<LibrarySort, string> = {
  last_opened: 'Last opened first',
  title: 'Title, A to Z',
  progress: 'Most read first',
};
const books = (k: number) => `${n(k)} ${k === 1 ? 'book' : 'books'}`;

/** `.lib-state` for a book on an account shelf (rules 12, 22, 24; edge cases). */
function stateLine(i: LibraryItem, shelf: AccountShelf): string | null {
  if (i.unpublished) return 'No longer on Arpedia';
  if (shelf === 'finished') return i.my_stars ? `★ ${i.my_stars} · you rated` : 'Rate this book';
  if (shelf === 'reading') return i.preview_ended ? 'Preview ended' : null;
  if (i.coming_soon_at) return `Out ${DATE.format(new Date(i.coming_soon_at))}`;
  if (i.gift_from_name) return `Gift from ${i.gift_from_name}`;
  if (i.owns_book) return 'Unlocked';
  return i.price_credits != null ? `${n(i.price_credits)} credits` : null;
}

/** The shelf a search result is on ("Reading", "Saved · Offline"). */
function shelvesLabel(i: LibraryItem, offline: boolean) {
  const on = ACCOUNT_SHELVES.filter((k) => i.shelves[k]).map((k) => SHELF_LABEL[k]);
  if (offline) on.push(SHELF_LABEL.offline);
  return on.join(' · ') || null;
}

export default function Library() {
  const { s } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const track = useTrack();
  const online = useOnline();
  usePendingOpsSync();

  const { view, sort, setSort } = useLibraryPrefs();
  const { shelf, setShelf, downloads } = useLibrarySession();
  const { shelves, counts: serverCounts } = useLibrary(sort);
  const offline = useOfflineShelf();

  // ─── Search (rule 9): on the phone, debounced 150 ms ───────────────────────
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);
  const searching = q.length > 0;

  // ─── Offline shelf: files on this phone plus downloads in flight ───────────
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const offlineEntries = useMemo<OfflineEntry[]>(() => {
    const out = [...offline.entries];
    const have = new Set(out.map((e) => e.bookId));
    for (const id of Object.keys(downloads)) {
      if (have.has(id)) continue;
      const item = ACCOUNT_SHELVES.flatMap((k) => shelfItems(shelves[k].data)).find((i) => i.book_id === id);
      out.unshift({
        bookId: id,
        revisionId: '',
        bytes: 0,
        chapterFiles: 0,
        validUntil: null,
        downloadedAt: Date.now(),
        item: item ?? null,
        title: item?.title ?? 'Downloading book',
        author: item?.author_name ?? null,
      });
    }
    return out;
  }, [offline.entries, downloads, shelves]);
  const offlineIds = useMemo(() => new Set(offlineEntries.map((e) => e.bookId)), [offlineEntries]);
  const onRefreshed = useCallback(
    (ok: boolean) => track('offline_shelf_refresh', { result: ok ? 'ok' : 'failed' }),
    [track],
  );
  useLicenceRefresh(offline.entries, onRefreshed);

  const counts: Record<ShelfName, number | null> = {
    reading: serverCounts?.reading ?? null,
    saved: serverCounts?.saved ?? null,
    finished: serverCounts?.finished ?? null,
    offline: offline.data ? offlineEntries.length : null,
  };

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || counts[shelf] == null) return;
    opened.current = true;
    track('library_opened', { shelf, count: counts[shelf] ?? 0 });
  }, [counts, shelf, track]);

  // ─── Sheets ────────────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterShelf, setFilterShelf] = useState<ShelfName>(shelf);
  const [filterSort, setFilterSort] = useState<LibrarySort>(sort);
  const [payRest, setPayRest] = useState<LibraryItem | null>(null);
  const [unlock, setUnlock] = useState<{ id: string; open: UnlockMode | 'short'; need?: number } | null>(
    null,
  );
  const [menu, setMenu] = useState<{ item: LibraryItem | null; id: string; title: string } | null>(null);
  // Keep the Pay the rest sheet on the newest server numbers while it is open (rule 19).
  const payItem = useMemo(() => {
    if (!payRest) return null;
    const fresh = shelfItems(shelves.reading.data).find((i) => i.book_id === payRest.book_id);
    return fresh ?? payRest;
  }, [payRest, shelves.reading.data]);

  const soon = () => toast({ message: 'Coming soon' });
  const openReader = (id: string) => router.push({ pathname: '/read/[id]', params: { id } });
  const openBook = (id: string) => router.push({ pathname: '/book/[id]', params: { id, source: 'library' } });
  const browse = (from: ShelfName | 'search', cta: string) => {
    track('library_empty_cta', { shelf: from, cta });
    // Home and Explore are flow 02's.
    router.navigate('/home');
  };

  const changeShelf = (k: ShelfName) => {
    if (k !== shelf) track('shelf_changed', { from: shelf, to: k });
    setShelf(k);
    setQuery('');
    setQ('');
  };
  const changeView = (v: 'grid' | 'list') => {
    if (v === view) return;
    track('library_view_toggled', { view: v });
    saveView(v);
  };

  // ─── Items of the shown shelf ──────────────────────────────────────────────
  const acct: AccountShelf | null = shelf === 'offline' ? null : shelf;
  const shelfQuery = acct ? shelves[acct] : null;
  const items = useMemo(() => (acct ? shelfItems(shelves[acct].data) : []), [acct, shelves]);

  const results = useMemo(() => {
    if (!searching) return [];
    const seen = new Map<string, LibraryItem>();
    for (const k of ACCOUNT_SHELVES) for (const i of shelfItems(shelves[k].data)) seen.set(i.book_id, i);
    return [...seen.values()].filter((i) => matchesQuery(i, q));
  }, [searching, q, shelves]);
  useEffect(() => {
    if (searching) track('library_search', { query_length: q.length, results: results.length });
  }, [searching, q, results.length, track]);

  const yearCount = useMemo(() => {
    const y = new Date().getFullYear();
    return shelfItems(shelves.finished.data).filter(
      (i) => i.finished_at && new Date(i.finished_at).getFullYear() === y,
    ).length;
  }, [shelves.finished.data]);

  const gridOf = (i: LibraryItem, k: AccountShelf | 'search'): GridBook => ({
    id: i.book_id,
    title: i.title,
    author: i.author_name ?? '',
    tone: coverTone(i.book_id),
    percent: k === 'reading' || (k === 'search' && i.shelves.reading) ? i.percent : null,
    state: k === 'search' ? shelvesLabel(i, offlineIds.has(i.book_id)) : stateLine(i, k),
  });
  const rowOf = (i: LibraryItem, k: AccountShelf | 'search'): RowBook => {
    const pct = Math.round(i.percent);
    const paygo = !i.owns_book && i.paid_credits > 0 && i.remaining_credits > 0;
    const opened = i.shelves.reading || i.shelves.finished;
    return {
      id: i.book_id,
      title: i.title,
      author: i.author_name ?? '',
      tone: coverTone(i.book_id),
      status: opened ? paymentLine(i) : (stateLine(i, k === 'search' ? 'saved' : k) ?? paymentLine(i)),
      percent: i.percent,
      meta: !opened
        ? ((k === 'search' ? shelvesLabel(i, offlineIds.has(i.book_id)) : null) ?? 'Not started')
        : i.preview_ended
          ? `${pct}% read`
          : `${pct}% · ${bookTimeLeft(i.words_left)}`,
      offline: offlineIds.has(i.book_id),
      action: paygo
        ? { kind: 'paygo', label: `Pay the rest · ${n(i.remaining_credits)}`, disabled: !online }
        : i.preview_ended && i.price_credits
          ? { kind: 'unlock', label: `Unlock · ${n(i.price_credits)} credits`, disabled: !online }
          : null,
    };
  };

  const find = (id: string) =>
    ACCOUNT_SHELVES.flatMap((k) => shelfItems(shelves[k].data)).find((i) => i.book_id === id) ?? null;

  /** Rule 13: Reading → reader (preview-ended books land on the preview-end card); others → book page. */
  const openItem = (i: LibraryItem, k: AccountShelf | 'search') => {
    const from = k === 'search' ? (ACCOUNT_SHELVES.find((x) => i.shelves[x]) ?? 'reading') : k;
    track('library_book_opened', { shelf: from, owned: i.owns_book, percent: Math.round(i.percent) });
    if (from === 'reading') return openReader(i.book_id);
    if (from === 'finished' && !i.my_stars)
      return router.push({ pathname: '/book/[id]/write-review', params: { id: i.book_id } });
    openBook(i.book_id);
  };

  const openOffline = async (e: OfflineEntry) => {
    track('library_book_opened', {
      shelf: 'offline',
      owned: e.item?.owns_book ?? false,
      percent: Math.round(e.item?.percent ?? 0),
    });
    const expired = e.validUntil != null && e.validUntil <= Date.now();
    if (!expired) return openReader(e.bookId);
    // Rule 31: refresh first with a connection, else say so.
    if (!online) return toast({ message: 'Connect to refresh this book' });
    setRefreshing(e.bookId);
    const ok = await refreshLicence(e);
    setRefreshing(null);
    void qc.invalidateQueries({ queryKey: ['library-offline'] });
    if (ok) openReader(e.bookId);
    else toast({ message: 'Couldn’t refresh this book. An active plan is needed to keep reading offline.' });
  };

  const onAction = (b: RowBook) => {
    const i = find(b.id);
    if (!i || !online) return toast({ message: 'Connect to continue' });
    if (b.action?.kind === 'paygo') return setPayRest(i);
    setUnlock({ id: i.book_id, open: 'all' });
  };

  // ─── Cover menu ────────────────────────────────────────────────────────────
  const menuItems = menu
    ? coverMenu({
        saved: !!menu.item?.shelves.saved,
        offline: offlineIds.has(menu.id),
        downloadable: !!menu.item && (menu.item.owns_book || menu.item.paid_credits > 0),
        online,
        onBook: () => {
          setMenu(null);
          openBook(menu.id);
        },
        onDownload: () => {
          setMenu(null);
          if (!online) return toast({ message: 'Connect to continue' });
          toast({ message: `Downloading ${menu.title}` });
          void downloadBook(qc, menu.id);
        },
        onRemoveDownload: () => {
          const bytes = offlineEntries.find((e) => e.bookId === menu.id)?.bytes ?? 0;
          setMenu(null);
          removeBookDownload(qc, menu.id);
          track('download_removed', { book_id: menu.id, bytes });
          toast({ message: `Removed ${menu.title} from this phone` });
        },
        onUnsave: () => {
          const it = menu.item;
          setMenu(null);
          if (!it) return;
          setSaved(qc, it, false).then(
            () => toast({ message: 'Removed from Saved' }),
            () => toast({ message: 'Couldn’t remove that. Try again.' }),
          );
        },
        onShare: () => {
          const by = menu.item?.author_name ? ` by ${menu.item.author_name}` : '';
          setMenu(null);
          void Share.share({ message: `${menu.title}${by}, on Arpedia` });
        },
      })
    : [];

  // ─── Paging and pull to refresh ────────────────────────────────────────────
  const onScroll = ({ nativeEvent: e }: { nativeEvent: NativeScrollEvent }) => {
    if (!shelfQuery || searching) return;
    const near = e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - s(400);
    if (near && shelfQuery.hasNextPage && !shelfQuery.isFetchingNextPage) void shelfQuery.fetchNextPage();
  };
  const [pulling, setPulling] = useState(false);
  const pull = async () => {
    setPulling(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['library'] }),
      qc.invalidateQueries({ queryKey: ['library-offline'] }),
    ]);
    setPulling(false);
  };

  // ─── Body ──────────────────────────────────────────────────────────────────
  const listView = view === 'list' && shelf !== 'offline';
  let head: { title: string; sub?: string } | null = null;
  let body: ReactNode = null;

  if (searching) {
    head = { title: 'Results', sub: books(results.length) };
    body =
      results.length === 0 ? (
        <ShelfEmpty
          title="No book called that in your library"
          action={{ label: 'Search all books', onPress: () => browse('search', 'search_all') }}
        />
      ) : listView ? (
        <LibList
          rows={results.map((i) => rowOf(i, 'search'))}
          onOpen={(b) => openItem(find(b.id)!, 'search')}
          onAction={onAction}
        />
      ) : (
        <LibGrid
          books={results.map((i) => gridOf(i, 'search'))}
          onOpen={(b) => openItem(find(b.id)!, 'search')}
          onMore={(b) => setMenu({ item: find(b.id), id: b.id, title: b.title })}
        />
      );
  } else if (shelf === 'offline') {
    const bytes = offlineEntries.reduce((t, e) => t + e.bytes, 0);
    head = {
      title: 'Offline downloads',
      sub: offlineEntries.length ? `${books(offlineEntries.length)} · ${formatMB(bytes)}` : undefined,
    };
    body = !offline.data ? (
      <GridSkeleton />
    ) : offlineEntries.length === 0 ? (
      <ShelfEmpty
        title="Nothing downloaded yet"
        body="Downloads last 7 days and refresh when you're back online with an active plan."
        action={{
          label: 'Download from Reading',
          onPress: () => {
            track('library_empty_cta', { shelf: 'offline', cta: 'download_from_reading' });
            changeShelf('reading');
          },
        }}
        second={{ label: 'Find a book', onPress: () => browse('offline', 'find_a_book') }}
      />
    ) : (
      <>
        <LibGrid
          books={offlineEntries.map((e) => {
            const d = downloads[e.bookId];
            const line =
              d === 'paused'
                ? 'Download paused'
                : typeof d === 'number'
                  ? `Downloading ${d}%`
                  : e.validUntil == null
                    ? 'Expired · connect to refresh'
                    : offlineLine(e.validUntil, Date.now()).label;
            return {
              id: e.bookId,
              title: e.title,
              author: e.author ?? '',
              tone: coverTone(e.bookId),
              percent: e.item ? e.item.percent : null,
              state: line,
              busy: refreshing === e.bookId,
            };
          })}
          onOpen={(b) => {
            const e = offlineEntries.find((x) => x.bookId === b.id);
            if (!e) return;
            if (downloads[e.bookId] === 'paused') {
              if (!online) return toast({ message: 'Connect to continue' });
              return void downloadBook(qc, e.bookId);
            }
            void openOffline(e);
          }}
          onMore={(b) => setMenu({ item: find(b.id), id: b.id, title: b.title })}
        />
        <OfflineNote />
      </>
    );
  } else if (acct && shelfQuery) {
    const k = acct;
    const total = counts[k];
    head =
      k === 'reading'
        ? { title: 'Reading', sub: SORT_SUB[sort] }
        : k === 'saved'
          ? { title: 'Saved', sub: total != null ? books(total) : undefined }
          : { title: 'Finished', sub: `${n(yearCount)} ${yearCount === 1 ? 'book' : 'books'} this year` };
    if (!shelfQuery.data) {
      body = shelfQuery.isError ? (
        <LibraryError online={online} onRetry={() => void shelfQuery.refetch()} />
      ) : listView ? (
        <ListSkeleton />
      ) : (
        <GridSkeleton />
      );
    } else if (items.length === 0) {
      body =
        k === 'reading' ? (
          <ShelfEmpty
            title="Nothing in progress"
            body="Pick something from Discover."
            action={{ label: 'Browse books', onPress: () => browse('reading', 'browse_books') }}
          />
        ) : k === 'saved' ? (
          <ShelfEmpty
            title="Nothing saved yet"
            body="Save books to find them here."
            action={{ label: 'Browse books', onPress: () => browse('saved', 'browse_books') }}
          />
        ) : (
          <ShelfEmpty title="No finished books yet" body="Books you finish will be here." />
        );
    } else {
      body = (
        <>
          {listView ? (
            <LibList
              rows={items.map((i) => rowOf(i, k))}
              onOpen={(b) => openItem(find(b.id)!, k)}
              onAction={onAction}
            />
          ) : (
            <LibGrid
              books={items.map((i) => gridOf(i, k))}
              onOpen={(b) => openItem(find(b.id)!, k)}
              onMore={(b) => setMenu({ item: find(b.id), id: b.id, title: b.title })}
            />
          )}
          {shelfQuery.isFetchingNextPage ? <PageSkeleton view={listView ? 'list' : 'grid'} /> : null}
        </>
      );
    }
  }

  const failed = !!shelfQuery?.isError && !!shelfQuery.data && online;

  return (
    <Screen top="org" scroll={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: s(28) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={64}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
      >
        <LibraryHero
          view={view}
          onView={changeView}
          query={query}
          onQuery={setQuery}
          onFilter={() => {
            setFilterShelf(shelf);
            setFilterSort(sort);
            setFilterOpen(true);
          }}
        />
        {failed ? <RefreshBanner onRetry={() => void pull()} /> : null}
        <ShelfChips shelf={searching ? null : shelf} counts={counts} onShelf={changeShelf} />
        {head ? <ShelfHead title={head.title} sub={head.sub} /> : null}
        <View>{body}</View>
      </ScrollView>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        shelf={filterShelf}
        sort={filterSort}
        counts={counts}
        onShelf={setFilterShelf}
        onSort={setFilterSort}
        onShow={() => {
          track('library_filter_applied', { shelf: filterShelf, sort: filterSort });
          setSort(filterSort);
          changeShelf(filterShelf);
          setFilterOpen(false);
        }}
      />
      <PayRestLibSheet
        item={payItem}
        online={online}
        onClose={() => setPayRest(null)}
        onShort={(it, left) => {
          setPayRest(null);
          setUnlock({ id: it.book_id, open: 'short', need: left });
        }}
        onPaid={(it, left) => {
          setPayRest(null);
          toast({ message: `Paid ${n(left)} credits · ${it.title} is yours to keep` });
          void qc.invalidateQueries({ queryKey: ['library'] });
          void qc.invalidateQueries({ queryKey: ['book-page', it.book_id] });
          void downloadBook(qc, it.book_id);
        }}
      />
      {unlock ? (
        <LibraryUnlock
          bookId={unlock.id}
          open={unlock.open}
          need={unlock.need}
          onClose={() => {
            setUnlock(null);
            void qc.invalidateQueries({ queryKey: ['library'] });
          }}
          onRead={() => {
            const id = unlock.id;
            setUnlock(null);
            openReader(id);
          }}
          onSoon={soon}
        />
      ) : null}
      <Sheet open={menu != null} onClose={() => setMenu(null)} bold title={menu?.title}>
        <MenuBody items={menuItems} />
      </Sheet>
    </Screen>
  );
}
