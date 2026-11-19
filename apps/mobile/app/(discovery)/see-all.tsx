import { router, useLocalSearchParams } from 'expo-router';
import { RefreshControl } from 'react-native';
import { EmptyState, IconButton, Screen, useTheme, useToast } from '@arpedia/ui';
import { BackHero, CatalogueList, ListError, RowsSkeleton, Top10List } from '../../features/02/ListViews';
import { listBook, useTop10 } from '../../features/02/explore';
import { useHome, type HomeBook } from '../../features/02/home';
import { discoveryLinks } from '../../features/02/links';

/**
 * `s-see-all`: Top 10 books with movement and credit cost (rules 9–10). Trending and New arrivals
 * open the same screen with that shelf's books (no rank).
 */
export default function SeeAll() {
  const { c, s } = useTheme();
  const toast = useToast();
  const go = discoveryLinks(toast);
  const { section = 'top10' } = useLocalSearchParams<{ section?: string }>();
  const isTop = section === 'top10';
  const top = useTop10();
  const home = useHome();
  const shelf = home.data?.sections.find((x) => x.key === section);
  const q = isTop ? top : home;

  const body = () => {
    if (isTop && top.data) {
      if (!top.data.length)
        return <EmptyState title="No rankings yet" body="Top 10 fills up as readers open books this week." />;
      return <Top10List books={top.data} onBook={go.book} />;
    }
    if (!isTop && home.data) {
      const books = (shelf?.items ?? []) as HomeBook[];
      if (!books.length)
        return <EmptyState title="Nothing here yet" body="New books are added every week." />;
      return <CatalogueList books={books.map(listBook)} onBook={go.book} />;
    }
    if (q.isError) return <ListError onRetry={() => void q.refetch()} />;
    return <RowsSkeleton rank={isTop} rows={8} />;
  };

  return (
    <Screen
      top="org"
      contentStyle={{ paddingBottom: s(28) }}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching && !q.isLoading}
          onRefresh={() => void q.refetch()}
          colors={[c.org]}
          progressBackgroundColor={c.white}
        />
      }
    >
      <BackHero
        title={isTop ? 'Top 10 books' : (shelf?.title ?? 'Books')}
        sub={isTop ? 'Most read on Arpedia this week' : undefined}
        onBack={() => router.back()}
        trail={
          <IconButton
            icon="filter"
            label="Filter"
            color={c.onOrg}
            onPress={() => router.push({ pathname: '/explore', params: { filter: '1' } })}
          />
        }
      />
      {body()}
    </Screen>
  );
}
