import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { TextInput } from 'react-native';
import { Keyboard, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useJoin } from '../../features/06/data';
import { authorKey } from '../../features/08/data';
import { Btn, EmptyState, Screen, Section, Sheet, Skeleton, Text, useTheme, useToast } from '@arpedia/ui';
import { isSearchable, normalizeQuery, searchesLabel, type LengthBand } from '@arpedia/core';
import { BookTile, Rail } from '../../features/02/HomeViews';
import { FilterBody } from '../../features/02/ListViews';
import {
  NoResults,
  OfflineNote,
  PeopleRail,
  RecentChips,
  RequestBody,
  ResultHead,
  ResultList,
  ScopeRow,
  SearchBar,
  SearchGenreGrid,
  SrSection,
  SuggestionList,
  TopResultCard,
  TrendingList,
  clubLetters,
  type ResultItem,
  type Scope,
  type Suggestion,
} from '../../features/02/SearchViews';
import { avatarTone, coverTone, useHome } from '../../features/02/home';
import { listBook } from '../../features/02/explore';
import { discoveryLinks } from '../../features/02/links';
import { useTrack } from '../../features/02/analytics';
import {
  logSearch,
  useCloseMatches,
  useDebounced,
  useLibraryMatches,
  useOnline,
  useRecent,
  useRequestBook,
  useSearch,
  useSearchHome,
  useSuggest,
  type Recent,
  type ServerSuggestion,
} from '../../features/02/search';

const NO_FILTER = { genre: null as string | null, bands: [] as LengthBand[] };

/** `s-search` → typing → results / no results → request sent (rules 18–28). */
export default function Search() {
  const { s } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const go = discoveryLinks(toast);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // `q`: text typed elsewhere (Library's "Search all books") runs at once.
  const initial = useLocalSearchParams<{ q?: string }>().q?.trim() ?? '';
  const [text, setText] = useState(initial);
  const [submitted, setSubmitted] = useState<string | null>(() =>
    isSearchable(normalizeQuery(initial)) ? normalizeQuery(initial) : null,
  );
  const [focused, setFocused] = useState(!initial);
  const [scope, setScope] = useState<Scope>('all');
  const [filters, setFilters] = useState(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState(NO_FILTER);
  const [requested, setRequested] = useState<number | null>(null);

  const online = useOnline();
  const track = useTrack();
  useEffect(() => track('search_opened'), [track]);
  const recent = useRecent();
  const home = useSearchHome();
  const firstName = useHome().data?.first_name?.trim() ?? null;
  const typing = submitted == null || normalizeQuery(text) !== submitted;
  const suggest = useSuggest(text, online && typing);
  const inLibrary = useLibraryMatches(text, !online && typing);
  const result = useSearch(submitted, filters);
  const draftQ = useDebounced(draft, 250);
  const draftResult = useSearch(filterOpen ? submitted : null, draftQ);
  const res = result.data;
  const none = !!res && res.counts.all === 0;
  const close = useCloseMatches(none);
  const request = useRequestBook();
  const join = useJoin();
  const follow = useMutation({
    mutationFn: async (author: string) => {
      const { error } = await supabase.rpc('follow_author', { p_author: author });
      if (error) throw error;
    },
    onSuccess: (_d, author) => void qc.invalidateQueries({ queryKey: authorKey(author) }),
  });

  const run = (q: string) => {
    const norm = normalizeQuery(q);
    if (!isSearchable(norm)) return;
    Keyboard.dismiss();
    setText(q);
    setSubmitted(norm);
    setScope('all');
    recent.add({ kind: 'query', label: norm });
  };
  const openBook = (id: string, title: string, q?: string) => {
    recent.add({ kind: 'book', label: title, id });
    if (q) logSearch(q, res?.counts.all ?? 1, { type: 'book', id });
    go.book(id);
  };
  const openAuthor = (id: string, name: string, q?: string) => {
    recent.add({ kind: 'author', label: name, id });
    if (q) logSearch(q, res?.counts.all ?? 1, { type: 'author', id });
    go.author(id);
  };
  const clear = () => {
    setText('');
    setSubmitted(null);
    setFilters(NO_FILTER);
    input.current?.focus();
  };

  // Results logged once per query and filter set.
  const logged = useRef('');
  const resultCount = res?.counts.all;
  useEffect(() => {
    if (resultCount == null || !submitted) return;
    const key = `${submitted}|${filters.genre}|${filters.bands.join(',')}`;
    if (logged.current === key) return;
    logged.current = key;
    logSearch(submitted, resultCount);
    track('search_submitted', { query_length: submitted.length, scope, result_count: resultCount });
    if (resultCount === 0) track('search_no_results', { query_length: submitted.length });
    // `scope` is read at log time only; changing tabs is not a new search.
  }, [resultCount, submitted, filters, track]);

  /* ─── Empty state ─── */
  const pickRecent = (r: Recent) =>
    r.kind === 'book' && r.id
      ? openBook(r.id, r.label)
      : r.kind === 'author' && r.id
        ? openAuthor(r.id, r.label)
        : run(r.label);
  const emptyState = () => {
    const d = home.data;
    return (
      <>
        {recent.items.length ? (
          <SrSection title="Recent" link="Clear" onLink={recent.clear}>
            <RecentChips
              items={recent.items.map((r, i) => ({ key: String(i), label: r.label }))}
              onPick={(k) => pickRecent(recent.items[Number(k)]!)}
            />
          </SrSection>
        ) : null}
        {!online ? (
          <EmptyState
            title="You're offline"
            body="Connect to search the catalogue. Your recent searches still work."
          />
        ) : !d ? (
          home.isError ? (
            <ErrorLine onRetry={() => void home.refetch()} />
          ) : (
            <View style={{ padding: s(16), gap: s(10) }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={s(40)} radius={s(10)} />
              ))}
            </View>
          )
        ) : (
          <>
            {d.trending.length ? (
              <SrSection title="Trending searches">
                <TrendingList
                  items={d.trending.map((t, i) => ({
                    query: t.query,
                    count:
                      i === 0
                        ? searchesLabel(t.searchers)
                        : searchesLabel(t.searchers).replace(' searches this week', ''),
                  }))}
                  onPick={(i) => {
                    const t = d.trending[i]!;
                    if (t.book_id) openBook(t.book_id, t.query, t.query);
                    else run(t.query);
                  }}
                />
              </SrSection>
            ) : null}
            {d.genres.length ? (
              <SrSection title="Browse genres" link="See all" onLink={() => go.explore()}>
                <SearchGenreGrid
                  genres={d.genres.map((g) => ({ slug: g.slug, name: g.name, count: g.book_count }))}
                  onPick={(slug) => go.explore(slug)}
                />
              </SrSection>
            ) : null}
            {d.authors.length ? (
              <SrSection title="Authors readers look for">
                <PeopleRail
                  people={d.authors.map((a) => ({
                    id: a.id,
                    name: a.name,
                    tone: avatarTone(a.id),
                    uri: a.avatar_url ?? undefined,
                  }))}
                  onPick={(id) => openAuthor(id, d.authors.find((a) => a.id === id)?.name ?? '')}
                />
              </SrSection>
            ) : null}
          </>
        )}
      </>
    );
  };

  /* ─── Typing ─── */
  const suggestions = (): Suggestion[] => {
    const q = normalizeQuery(text);
    const head: Suggestion = { kind: 'all', query: text.trim() };
    if (!online) {
      // Offline (rule 22): books in the reader's library, then recent books and authors.
      const books = inLibrary.map((b): Suggestion & { kind: 'book' } => ({
        kind: 'book',
        id: b.book_id,
        title: b.title,
        sub: b.author_name ? `Book · ${b.author_name}` : 'Book',
        tone: coverTone(b.book_id),
      }));
      const seen = new Set(books.map((b) => b.id));
      return [
        head,
        ...books,
        ...recent.items
          .filter((r) => r.kind !== 'query' && !seen.has(r.id!) && normalizeQuery(r.label).includes(q))
          .map((r): Suggestion =>
            r.kind === 'book'
              ? { kind: 'book', id: r.id!, title: r.label, sub: 'Book', tone: coverTone(r.id!) }
              : { kind: 'person', id: r.id!, title: r.label, sub: 'Author', tone: avatarTone(r.id!) },
          ),
      ];
    }
    return [head, ...(suggest.data ?? []).map(toSuggestion)];
  };
  const pickSuggestion = (it: Suggestion) => {
    const q = normalizeQuery(text);
    if (it.kind === 'all') return run(text);
    track('search_suggestion_tapped', {
      type: it.kind === 'person' ? (it.letters ? 'club' : 'author') : it.kind,
    });
    logSearch(q, (suggest.data ?? []).length, { type: it.kind === 'person' ? 'author' : it.kind, id: it.id });
    if (it.kind === 'book') return openBook(it.id, it.title);
    if (it.kind === 'genre') return go.explore(it.id);
    return openAuthor(it.id, it.title);
  };

  /* ─── Results ─── */
  const resultsBody = () => {
    if (!res) {
      if (result.isError) return <ErrorLine onRetry={() => void result.refetch()} />;
      return (
        <View style={{ padding: s(16), gap: s(14) }}>
          <Skeleton height={s(162)} radius={s(18)} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={s(72)} radius={s(10)} />
          ))}
        </View>
      );
    }
    if (none)
      return (
        <>
          <NoResults
            query={submitted ?? ''}
            asking={request.isPending}
            onAsk={() =>
              request.mutate(submitted ?? '', {
                onSuccess: (n) => {
                  track('book_requested');
                  setRequested(n);
                },
                onError: (e) => toast({ message: e.message || 'Couldn’t send that. Try again.' }),
              })
            }
          />
          {close.data?.length ? (
            <SrSection title="You might like" link="Explore" onLink={() => go.explore()}>
              <Rail label="You might like">
                {close.data.map((b) => (
                  <BookTile
                    key={b.id}
                    book={{ id: b.id, title: b.title, author: b.author_name, tone: coverTone(b.id) }}
                    onPress={() => openBook(b.id, b.title)}
                  />
                ))}
              </Rail>
            </SrSection>
          ) : null}
        </>
      );
    const q = submitted ?? '';
    const top = scope === 'all' || scope === 'books' ? res.top : null;
    const books: ResultItem[] =
      scope === 'all' || scope === 'books'
        ? res.books
            .filter((b) => b.id !== top?.id)
            .map((b) => ({ kind: 'book', ...listBook(b), snippet: b.snippet, promoted: b.promoted }))
        : [];
    const authors: ResultItem[] =
      scope === 'all' || scope === 'authors'
        ? res.authors.map((a) => ({
            kind: 'person',
            id: a.id,
            title: a.name,
            meta: `${a.books} ${a.books === 1 ? 'book' : 'books'} on Arpedia`,
            tone: avatarTone(a.id),
            uri: a.avatar_url ?? undefined,
            action: 'Follow',
          }))
        : [];
    const clubs: ResultItem[] =
      scope === 'all' || scope === 'clubs'
        ? res.clubs.map((c) => ({
            kind: 'club',
            id: c.id,
            title: c.name,
            meta: `${c.members.toLocaleString('en-NG')} members`,
            tone: avatarTone(c.id),
            action: 'Join',
            letters: clubLetters(c.name),
          }))
        : [];
    const openItem = (it: ResultItem) =>
      it.kind === 'book'
        ? openBook(it.id, it.title, q)
        : it.kind === 'person'
          ? openAuthor(it.id, it.title, q)
          : router.push(`/chat/${it.id}`);
    return (
      <>
        {top ? (
          <TopResultCard
            book={{ ...listBook(top), uri: undefined }}
            query={q}
            onOpen={() => openBook(top.id, top.title, q)}
          />
        ) : null}
        {books.length ? (
          <>
            <ResultHead title="Books" count={res.counts.books} />
            <ResultList items={books} query={q} onOpen={openItem} />
          </>
        ) : null}
        {authors.length ? (
          <>
            <ResultHead title="Authors" count={res.counts.authors} />
            <ResultList
              items={authors}
              query={q}
              onOpen={openItem}
              onAction={(it) =>
                follow.mutate(it.id, {
                  onSuccess: () => toast({ message: `You follow ${it.title}` }),
                  onError: () => toast({ message: 'Couldn’t update Follow. Try again.' }),
                })
              }
            />
          </>
        ) : null}
        {clubs.length ? (
          <>
            <ResultHead title="Clubs" count={res.counts.clubs} />
            <ResultList
              items={clubs}
              query={q}
              onOpen={openItem}
              onAction={(it) =>
                join.mutate(it.id, {
                  onSuccess: () => router.push(`/chat/${it.id}`),
                  onError: () => toast({ message: 'Couldn’t join. Try again.' }),
                })
              }
            />
          </>
        ) : null}
        {!top && !books.length && !authors.length && !clubs.length ? (
          <EmptyState title="Nothing in this group" body="Try All to see every match." />
        ) : null}
      </>
    );
  };

  const mode = isSearchable(text) && typing ? 'typing' : submitted && !typing ? 'results' : 'empty';
  const draftCount = draftResult.data && draftQ === draft ? draftResult.data.counts.books : null;

  return (
    <>
      <Screen
        top="org"
        contentStyle={{ paddingBottom: s(28) }}
        header={
          <>
            <SearchBar
              ref={input}
              value={text}
              onChange={(v) => {
                setText(v);
                if (!v) setSubmitted(null);
              }}
              onSubmit={() => run(text)}
              onBack={() => router.back()}
              onClear={clear}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              focused={focused}
              autoFocus
            />
            {mode === 'results' && res && !none ? (
              <View style={{ backgroundColor: 'transparent' }}>
                <ScopeRow
                  counts={res.counts}
                  scope={scope}
                  onScope={setScope}
                  onFilter={() => {
                    setDraft(filters);
                    setFilterOpen(true);
                  }}
                />
              </View>
            ) : null}
          </>
        }
      >
        {mode === 'typing' ? (
          <>
            {!online ? <OfflineNote /> : null}
            <SuggestionList items={suggestions()} query={text} onPick={pickSuggestion} />
          </>
        ) : mode === 'results' ? (
          resultsBody()
        ) : (
          emptyState()
        )}
      </Screen>

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter by genre">
        <FilterBody
          genres={[
            { slug: null, name: 'All', count: res?.counts.books ?? 0 },
            ...(home.data?.genres ?? []).map((g) => ({ slug: g.slug, name: g.name, count: g.book_count })),
          ]}
          genre={draft.genre}
          bands={draft.bands}
          count={draftCount}
          onGenre={(genre) => setDraft((d) => ({ ...d, genre }))}
          onBand={(b) =>
            setDraft((d) => ({
              ...d,
              bands: d.bands.includes(b) ? d.bands.filter((x) => x !== b) : [...d.bands, b],
            }))
          }
          onReset={() => setDraft(NO_FILTER)}
          onShow={() => {
            track('filter_applied', {
              genre: draft.genre,
              length_bands: draft.bands.join(','),
              result_count: draftCount ?? -1,
            });
            setFilters(draft);
            setFilterOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={requested != null} onClose={() => setRequested(null)} title="Request sent" bold>
        <RequestBody
          name={firstName}
          count={requested ?? 1}
          query={submitted ?? ''}
          onDone={() => {
            setRequested(null);
            clear();
          }}
        />
      </Sheet>
    </>
  );
}

function toSuggestion(x: ServerSuggestion): Suggestion {
  switch (x.type) {
    case 'book':
      return {
        kind: 'book',
        id: x.id,
        title: x.title,
        sub: x.topic ? `Book · ${x.sub} · topic “${x.topic}”` : `Book · ${x.sub}`,
        tone: coverTone(x.id),
      };
    case 'author':
      return {
        kind: 'person',
        id: x.id,
        title: x.title,
        sub: `Author · ${x.books} ${x.books === 1 ? 'book' : 'books'}`,
        tone: avatarTone(x.id),
        uri: x.avatar_url ?? undefined,
      };
    case 'club':
      return {
        kind: 'person',
        id: x.id,
        title: x.title,
        sub: `Book club · ${x.members.toLocaleString('en-NG')} members`,
        tone: avatarTone(x.id),
        letters: clubLetters(x.title),
      };
    case 'genre':
      return {
        kind: 'genre',
        id: x.slug,
        title: x.title,
        sub: `Genre · ${x.books} ${x.books === 1 ? 'book' : 'books'}`,
      };
  }
}

/** Search errors show under the box with Retry (States: Error). */
function ErrorLine({ onRetry }: { onRetry: () => void }) {
  const { s } = useTheme();
  return (
    <Section>
      <View style={{ paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <Text size={13.5} color="ink2" style={{ flex: 1 }}>
          {"Couldn't search right now."}
        </Text>
        <Btn label="Retry" variant="g" size="sm" onPress={onRetry} />
      </View>
    </Section>
  );
}
