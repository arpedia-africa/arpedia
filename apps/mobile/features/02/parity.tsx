// Flow 02 screens with the prototype's values (tools/parity/s-*.html), for app/parity.tsx.
import { View } from 'react-native';
import { IconButton, Section, useTheme } from '@arpedia/ui';
import type { CoverTone } from '@arpedia/ui';
import { movement } from '@arpedia/core';
import {
  NoneSample,
  NotificationsSample,
  RequestSample,
  ResultsSample,
  SearchSample,
  TypingSample,
} from './parity-search';
import {
  BackHero,
  CatalogueHead,
  CatalogueList,
  FilterBody,
  GenreChips,
  SearchRow,
  Top10List,
  type ListBook,
} from './ListViews';
import {
  AuthorTile,
  BookTile,
  GenreGrid,
  HomeHero,
  Rail,
  Top10Band,
  type AuthorCard,
  type BookCard,
} from './HomeViews';

const noop = () => {};
const bk = (tone: CoverTone, title: string, author: string): BookCard => ({ id: title, title, author, tone });

const TRENDING = [
  bk('c1', 'Harmattan Letters', 'Ifeoma Nwachukwu'),
  bk('c3', 'The Alignment', 'Adaeze Rosemary Possible'),
  bk('c2', 'Still Waters, Lagos', 'Chioma Okafor'),
  bk('c4', 'Seven Bridges to Jos', 'Musa Danladi'),
];
const AUTHORS: AuthorCard[] = [
  { id: 'a1', name: 'Ifeoma Nwachukwu', short: 'Ifeoma N.', tone: 'm' },
  { id: 'a2', name: 'Adaeze Rosemary Possible', short: 'Adaeze R. P.', tone: 'r' },
  { id: 'a3', name: 'Musa Danladi', short: 'Musa D.', tone: 'o' },
  { id: 'a4', name: 'Kemi Ogunleye', short: 'Kemi O.', tone: 'k' },
  { id: 'a5', name: 'Chioma Okafor', short: 'Chioma O.', tone: 't' },
];
const NEW = [
  bk('c6', 'A House Called Grace', 'Kemi Ogunleye'),
  bk('c5', 'Ruth of Ibadan', 'Tolu Adebayo'),
  bk('c7', 'Psalms for the Danfo', 'Emeka Obi'),
  bk('c8', 'Bread on Water', 'Halima Bello'),
];
const TOP = [
  bk('c3', 'The Alignment', 'Adaeze Rosemary Possible'),
  bk('c1', 'Harmattan Letters', 'Ifeoma Nwachukwu'),
  bk('c2', 'Still Waters, Lagos', 'Chioma Okafor'),
  bk('c4', 'Seven Bridges to Jos', 'Musa Danladi'),
  bk('c5', 'Ruth of Ibadan', 'Tolu Adebayo'),
].map((b, i) => ({ ...b, rank: i + 1 }));
const RECOMMENDED = [
  bk('c7', 'Psalms for the Danfo', 'Emeka Obi'),
  bk('c6', 'A House Called Grace', 'Kemi Ogunleye'),
  bk('c8', 'Bread on Water', 'Halima Bello'),
  bk('c5', 'Ruth of Ibadan', 'Tolu Adebayo'),
];
const GENRES = [
  { id: 'g1', name: 'Christian & Faith', count: 142 },
  { id: 'g2', name: 'Fiction', count: 96 },
  { id: 'g3', name: 'Romance', count: 71 },
  { id: 'g4', name: 'Drama', count: 38 },
];

const Shelf = ({ title, sub, books }: { title: string; sub?: string; books: BookCard[] }) => (
  <Section title={title} sub={sub} link="See all" onLink={noop}>
    <Rail label={title}>
      {books.map((b) => (
        <BookTile key={b.id} book={b} onPress={noop} />
      ))}
    </Rail>
  </Section>
);

/** `s-home` with the prototype's sample shelves (no tab bar). */
export function HomeSample() {
  return (
    <>
      <HomeHero greeting="Good evening, Ngozi." credits={840} unread={3} />
      <Shelf title="Trending this week" books={TRENDING} />
      <Section title="Arpedia authors">
        <Rail label="Arpedia authors">
          {AUTHORS.map((a) => (
            <AuthorTile key={a.id} author={a} onPress={noop} />
          ))}
        </Rail>
      </Section>
      <Shelf title="New arrivals" books={NEW} />
      <Top10Band title="Top 10 books" books={TOP} onSeeAll={noop} />
      <Shelf
        title="Recommended for you"
        sub="Because you picked Fiction and Nigerian books"
        books={RECOMMENDED}
      />
      <Section title="Browse genres" link="Explore" onLink={noop} style={{ paddingBottom: 28 }}>
        <GenreGrid genres={GENRES} />
      </Section>
    </>
  );
}

const row = (tone: CoverTone, title: string, author: string, meta: string, credits: number): ListBook => ({
  id: title,
  title,
  author,
  meta,
  credits,
  tone,
});
const CATALOGUE = [
  row('c3', 'The Alignment', 'Adaeze Rosemary Possible', 'Christian romance · 13 hr read', 184),
  row('c1', 'Harmattan Letters', 'Ifeoma Nwachukwu', 'Christian & Faith · 6 hr read', 125),
  row('c2', 'Still Waters, Lagos', 'Chioma Okafor', 'Romance · 3 hr read', 60),
  row('c4', 'Seven Bridges to Jos', 'Musa Danladi', 'Drama · 9 hr read', 196),
  row('c5', 'Ruth of Ibadan', 'Tolu Adebayo', 'Christian & Faith · 5 hr read', 117),
  row('c6', 'A House Called Grace', 'Kemi Ogunleye', 'Drama · 5 hr read', 110),
  row('c7', 'Psalms for the Danfo', 'Emeka Obi', 'Fiction · 2 hr read', 44),
  row('c8', 'Bread on Water', 'Halima Bello', 'Nonfiction · 4 hr read', 96),
];
// Last week's ranks that give the prototype's badges: —, ▲ 3, New, ▼ 1, —, ▲ 2, ▼ 2, New.
const PREV = [1, 5, null, 3, 5, 8, 5, null];
const RANKED = CATALOGUE.map((b, i) => ({ ...b, rank: i + 1, move: movement(i + 1, PREV[i]) }));
const CHIPS = [
  { slug: null, name: 'All', count: 10 },
  { slug: 'christian-faith', name: 'Christian & Faith', count: 3 },
  { slug: 'drama', name: 'Drama', count: 2 },
  { slug: 'fiction', name: 'Fiction', count: 2 },
  { slug: 'nonfiction', name: 'Nonfiction', count: 1 },
  { slug: 'romance', name: 'Romance', count: 2 },
];

function SeeAllSample() {
  const { c, s } = useTheme();
  return (
    <>
      <BackHero
        title="Top 10 books"
        sub="Most read on Arpedia this week"
        trail={<IconButton icon="filter" label="Filter" color={c.onOrg} />}
      />
      <View style={{ paddingBottom: s(28) }}>
        <Top10List books={RANKED} />
      </View>
    </>
  );
}

function ExploreSample() {
  const { s } = useTheme();
  return (
    <>
      <BackHero title="Explore">
        <SearchRow />
      </BackHero>
      <View style={{ paddingBottom: s(28) }}>
        <GenreChips genres={CHIPS} value={null} />
        <Section>
          <CatalogueHead count={10} sort="most_read" />
          <CatalogueList books={CATALOGUE} />
        </Section>
      </View>
    </>
  );
}

/** The sheet's `.pb` laid flat: padding 4 18 28, gap 14. */
function FilterSample() {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(4), paddingHorizontal: s(18), paddingBottom: s(28), gap: s(14) }}>
      <FilterBody genres={CHIPS} genre={null} bands={[]} count={10} />
    </View>
  );
}

const PAGES02 = [
  's-home',
  's-see-all',
  's-explore',
  's-explore-filter',
  's-search',
  's-search-typing',
  's-search-results',
  's-search-none',
  's-search-request',
  's-notifications',
] as const;
export type Page02 = (typeof PAGES02)[number];
export const isFlow02 = (p: string): p is Page02 => (PAGES02 as readonly string[]).includes(p);

export function Flow02({ page }: { page: Page02 }) {
  switch (page) {
    case 's-home':
      return <HomeSample />;
    case 's-see-all':
      return <SeeAllSample />;
    case 's-explore':
      return <ExploreSample />;
    case 's-explore-filter':
      return <FilterSample />;
    case 's-search':
      return <SearchSample />;
    case 's-search-typing':
      return <TypingSample />;
    case 's-search-results':
      return <ResultsSample />;
    case 's-search-none':
      return <NoneSample />;
    case 's-search-request':
      return <RequestSample />;
    case 's-notifications':
      return <NotificationsSample />;
  }
}
