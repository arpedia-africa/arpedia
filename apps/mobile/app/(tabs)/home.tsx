import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Screen, Section, useTheme, useToast } from '@arpedia/ui';
import { greeting } from '@arpedia/core';
import {
  AuthorTile,
  BookTile,
  GenreGrid,
  HomeHero,
  NoBooks,
  Rail,
  ShelfError,
  ShelfSkeleton,
  Top10Band,
  type BookCard,
} from '../../features/02/HomeViews';
import {
  avatarTone,
  coverTone,
  logShelfTap,
  picksLine,
  shortName,
  useHome,
  type HomeBook,
} from '../../features/02/home';
import { discoveryLinks } from '../../features/02/links';
import { BANNERS_KEY, HomeAnnouncements } from '../../features/15/AnnouncementCard';

const card = (b: HomeBook): BookCard => ({
  id: b.id,
  title: b.title,
  author: b.author_name,
  tone: coverTone(b.id),
});

export default function Home() {
  const { c, s } = useTheme();
  const toast = useToast();
  const go = discoveryLinks(toast);
  const home = useHome();
  const qc = useQueryClient();
  const [pulling, setPulling] = useState(false);
  const data = home.data;
  const name = data?.first_name?.trim();
  const hello = `${greeting(new Date().getHours())}${name ? `, ${name}` : ''}.`;

  const refresh = async () => {
    setPulling(true);
    await Promise.all([home.refetch(), qc.invalidateQueries({ queryKey: BANNERS_KEY })]);
    setPulling(false);
  };

  const body = () => {
    if (!data) {
      if (home.isError) return <ShelfError title="Trending this week" onRetry={() => void home.refetch()} />;
      return (
        <>
          <ShelfSkeleton />
          <ShelfSkeleton />
          <ShelfSkeleton />
        </>
      );
    }
    const noBooks = data.live_books === 0;
    return data.sections.map((sec) => {
      switch (sec.key) {
        case 'authors':
          return sec.items.length ? (
            <Section key={sec.key} title={sec.title}>
              <Rail label={sec.title}>
                {sec.items.map((a, i) => (
                  <AuthorTile
                    key={a.id}
                    author={{
                      id: a.id,
                      name: a.name,
                      short: shortName(a.name),
                      tone: avatarTone(a.id),
                      uri: a.avatar_url ?? undefined,
                    }}
                    onPress={() => {
                      logShelfTap(sec.key, i);
                      go.author(a.id);
                    }}
                  />
                ))}
              </Rail>
            </Section>
          ) : null;
        case 'top10':
          return sec.items.length ? (
            <Top10Band
              key={sec.key}
              title={sec.title}
              books={sec.items.map((b) => ({ ...card(b), rank: b.rank ?? 0 }))}
              onSeeAll={() => go.seeAll('top10')}
              onBook={(id) => {
                logShelfTap(
                  sec.key,
                  sec.items.findIndex((b) => b.id === id),
                );
                go.book(id);
              }}
            />
          ) : null;
        case 'genres':
          return sec.items.length ? (
            <Section key={sec.key} title={sec.title} link="Explore" onLink={() => go.explore()}>
              <GenreGrid
                genres={sec.items.slice(0, 4).map((g) => ({ id: g.slug, name: g.name, count: g.book_count }))}
                onGenre={(slug) => go.explore(slug)}
              />
            </Section>
          ) : null;
        default: {
          if (noBooks && sec.key === 'trending') return <NoBooks key="empty" />;
          if (!sec.items.length) return null;
          const recommended = sec.key === 'recommended';
          return (
            <Section
              key={sec.key}
              title={sec.title}
              sub={recommended ? picksLine(data.picks) : undefined}
              link="See all"
              onLink={() => (recommended ? go.explore() : go.seeAll(sec.key))}
            >
              <Rail label={sec.title}>
                {sec.items.map((b, i) => (
                  <BookTile
                    key={b.id}
                    book={card(b)}
                    onPress={() => {
                      logShelfTap(sec.key, i);
                      go.book(b.id);
                    }}
                  />
                ))}
              </Rail>
            </Section>
          );
        }
      }
    });
  };

  return (
    <Screen
      top="org"
      contentStyle={{ paddingBottom: s(28) }}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => void refresh()}
          colors={[c.org]}
          progressBackgroundColor={c.white}
        />
      }
    >
      <HomeHero
        greeting={hello}
        credits={data?.credits ?? null}
        unread={data?.unread ?? 0}
        onCredits={go.credits}
        onExplore={() => go.explore()}
        onBell={go.notifications}
        onSearch={go.search}
      />
      <HomeAnnouncements style={{ paddingHorizontal: s(16), paddingTop: s(16) }} />
      <View>{body()}</View>
    </Screen>
  );
}
