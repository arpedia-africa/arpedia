import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { EmptyState, Screen, Section, Sheet, Skeleton, useTheme, useToast } from '@arpedia/ui';
import type { LengthBand } from '@arpedia/core';
import {
  BackHero,
  CatalogueHead,
  CatalogueList,
  FilterBody,
  GenreChips,
  ListError,
  OptionRow,
  RowsSkeleton,
  SORT_LABEL,
  SearchRow,
  type SortKey,
} from '../../features/02/ListViews';
import { chipGenres, listBook, useCatalogue, useFilterCount, useGenres } from '../../features/02/explore';
import { discoveryLinks } from '../../features/02/links';
import { useTrack } from '../../features/02/analytics';

/** `s-explore` + `s-explore-filter`: genre chips, the whole catalogue, filter and sort (rules 12–17). */
export default function Explore() {
  const { c, s } = useTheme();
  const toast = useToast();
  const go = discoveryLinks(toast);
  const params = useLocalSearchParams<{ genre?: string; filter?: string }>();
  const [genre, setGenre] = useState<string | null>(params.genre ?? null);
  const [bands, setBands] = useState<LengthBand[]>([]);
  const [sort, setSort] = useState<SortKey>('most_read');
  const [filterOpen, setFilterOpen] = useState(params.filter === '1');
  const [sortOpen, setSortOpen] = useState(false);
  // Sheet choices apply on "Show N books"; until then they are a draft.
  const [draftGenre, setDraftGenre] = useState<string | null>(genre);
  const [draftBands, setDraftBands] = useState<LengthBand[]>(bands);

  const track = useTrack();
  useEffect(() => track('explore_opened'), [track]);

  const genres = useGenres();
  const list = useCatalogue(genre, bands, sort);
  const draftCount = useFilterCount(draftGenre, draftBands, filterOpen);
  const total = useFilterCount(null, [], true);

  const openFilter = () => {
    setDraftGenre(genre);
    setDraftBands(bands);
    setFilterOpen(true);
  };

  const pages = list.data?.pages;
  const books = pages?.flatMap((p) => p.items).map(listBook);
  const count = pages?.[0]?.count ?? null;
  const all = genres.data ?? [];
  const chips = chipGenres(all, total ?? 0, genre);
  const sheetGenres = [{ slug: null, name: 'All', count: total ?? 0 }, ...all];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (
      layoutMeasurement.height + contentOffset.y > contentSize.height - 600 &&
      list.hasNextPage &&
      !list.isFetchingNextPage
    )
      void list.fetchNextPage();
  };

  const body = () => {
    if (books) {
      if (!books.length)
        return (
          <EmptyState
            title="No books here yet"
            body="Try another genre."
            action={
              genre || bands.length
                ? { label: 'Show all books', onPress: () => (setGenre(null), setBands([])) }
                : undefined
            }
          />
        );
      return (
        <>
          <CatalogueList books={books} onBook={go.book} />
          {list.isFetchingNextPage ? <RowsSkeleton rows={2} /> : null}
        </>
      );
    }
    if (list.isError) return <ListError onRetry={() => void list.refetch()} />;
    return <RowsSkeleton rows={8} />;
  };

  return (
    <>
      <Screen
        top="org"
        contentStyle={{ paddingBottom: s(28) }}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage && !list.isLoading}
            onRefresh={() => void Promise.all([list.refetch(), genres.refetch()])}
            colors={[c.org]}
            progressBackgroundColor={c.white}
          />
        }
      >
        <BackHero title="Explore" onBack={() => router.back()}>
          <SearchRow onSearch={go.search} onFilter={openFilter} />
        </BackHero>
        {genres.data ? (
          <GenreChips genres={chips} value={genre} onChange={setGenre} />
        ) : (
          <View style={{ flexDirection: 'row', gap: s(8), paddingHorizontal: s(16), paddingTop: s(16) }}>
            {[44, 120, 64, 70].map((w, i) => (
              <Skeleton key={i} width={s(w)} height={s(36)} radius={999} />
            ))}
          </View>
        )}
        <Section>
          <CatalogueHead count={count} sort={sort} onSort={() => setSortOpen(true)} />
          {body()}
        </Section>
      </Screen>

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter by genre">
        <FilterBody
          genres={sheetGenres}
          genre={draftGenre}
          bands={draftBands}
          count={draftCount}
          onGenre={setDraftGenre}
          onBand={(b) => setDraftBands((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]))}
          onReset={() => (setDraftGenre(null), setDraftBands([]))}
          onShow={() => {
            track('filter_applied', {
              genre: draftGenre,
              length_bands: draftBands.join(','),
              result_count: draftCount ?? -1,
            });
            setGenre(draftGenre);
            setBands(draftBands);
            setFilterOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <View accessibilityRole="radiogroup" style={{ gap: s(10) }}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <OptionRow
              key={k}
              title={SORT_LABEL[k]}
              selected={sort === k}
              onPress={() => {
                setSort(k);
                setSortOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}
