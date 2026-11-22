// Flow 02 Search and Notifications screens with the prototype's values (tools/parity/s-search*.html,
// s-notifications.html), for app/parity.tsx.
import { View } from 'react-native';
import { useTheme } from '@arpedia/ui';
import { BookTile, Rail } from './HomeViews';
import { NotificationFeed, NotificationsHero, type NotifRow } from './NotificationViews';
import {
  NoResults,
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
  type ResultItem,
} from './SearchViews';

const noop = () => {};

/** `.body.body-end`: the scrolling part with its 28px end padding. */
const BodyEnd = ({ children }: { children: React.ReactNode }) => {
  const { s } = useTheme();
  return <View style={{ paddingBottom: s(28) }}>{children}</View>;
};

export function SearchSample() {
  return (
    <>
      <SearchBar value="" focused />
      <BodyEnd>
        <SrSection title="Recent" link="Clear" onLink={noop}>
          <RecentChips
            items={[
              { key: '1', label: 'grace' },
              { key: '2', label: 'Chioma Okafor' },
              { key: '3', label: 'harmattan' },
            ]}
          />
        </SrSection>
        <SrSection title="Trending searches">
          <TrendingList
            items={[
              { query: 'grace', count: '2.4k searches this week' },
              { query: 'harmattan letters', count: '1.9k' },
              { query: 'Chioma Okafor', count: '1.1k' },
              { query: 'christian romance', count: '860' },
              { query: 'things fall apart', count: '540' },
            ]}
          />
        </SrSection>
        <SrSection title="Browse genres" link="See all" onLink={noop}>
          <SearchGenreGrid
            genres={[
              { slug: 'a', name: 'Christian & Faith', count: 96 },
              { slug: 'b', name: 'Clean romance', count: 74 },
              { slug: 'c', name: 'African stories', count: 61 },
              { slug: 'd', name: 'Devotionals', count: 38 },
              { slug: 'e', name: 'Thriller', count: 29 },
              { slug: 'f', name: 'Poetry', count: 22 },
            ]}
          />
        </SrSection>
        <SrSection title="Authors readers look for">
          <PeopleRail
            people={[
              { id: '1', name: 'Ifeoma Nwachukwu', tone: 'g' },
              { id: '2', name: 'Chioma Okafor', tone: 't' },
              { id: '3', name: 'Adaeze R. Possible', tone: 'r' },
              { id: '4', name: 'Musa Danladi', tone: 'k' },
              { id: '5', name: 'Kemi Ogunleye', tone: 'm' },
              { id: '6', name: 'Emeka Obi', tone: 'o' },
            ]}
          />
        </SrSection>
      </BodyEnd>
    </>
  );
}

export function TypingSample() {
  return (
    <>
      <SearchBar value="gra" focused />
      <BodyEnd>
        <SuggestionList
          query="gra"
          items={[
            { kind: 'all', query: 'gra' },
            { kind: 'book', id: '1', title: 'A House Called Grace', sub: 'Book · Kemi Ogunleye', tone: 'c6' },
            {
              kind: 'person',
              id: '2',
              title: 'Grace Effiong',
              sub: 'Author · 1 book coming soon',
              tone: 'r',
            },
            {
              kind: 'book',
              id: '3',
              title: 'Bread on Water',
              sub: 'Book · Halima Bello · topic “grace”',
              tone: 'c8',
            },
            {
              kind: 'person',
              id: '4',
              title: 'Grace & Glory Readers',
              sub: 'Book club · 1,204 members',
              tone: 'g',
              letters: 'GG',
            },
            { kind: 'genre', id: '5', title: 'Graphic novels', sub: 'Genre · 6 books' },
          ]}
        />
      </BodyEnd>
    </>
  );
}

const BOOKS: ResultItem[] = [
  {
    kind: 'book',
    id: '1',
    title: 'Harmattan Letters',
    author: 'Ifeoma Nwachukwu',
    snippet: '“Grace did not ask her to be ready. It came the way harmattan comes.”',
    meta: 'Christian & Faith · 6 hr read',
    credits: 125,
    tone: 'c1',
  },
  {
    kind: 'book',
    id: '2',
    title: 'Bread on Water',
    author: 'Halima Bello',
    snippet: 'A widow, a bakery in Kano and the slow arithmetic of grace.',
    meta: 'Fiction · 4 hr read',
    credits: 96,
    tone: 'c8',
  },
  {
    kind: 'book',
    id: '3',
    title: 'Psalms for the Danfo',
    author: 'Emeka Obi',
    snippet: '“Grace on the 4:15 to Obalende” and 40 more poems.',
    meta: 'Poetry · 2 hr read',
    credits: 44,
    tone: 'c7',
  },
];

export function ResultsSample() {
  return (
    <>
      <SearchBar value="grace" focused={false} />
      <ScopeRow counts={{ all: 7, books: 4, authors: 1, clubs: 2 }} scope="all" />
      <BodyEnd>
        <TopResultCard
          query="grace"
          book={{
            id: 'top',
            title: 'A House Called Grace',
            author: 'Kemi Ogunleye',
            meta: 'Christian & Faith · 6 hr read',
            credits: 110,
            tone: 'c6',
          }}
        />
        <ResultHead title="Books" count={4} />
        <ResultList items={BOOKS} query="grace" />
        <ResultHead title="Authors" count={1} />
        <ResultList
          query="grace"
          items={[
            {
              kind: 'person',
              id: 'a',
              title: 'Grace Effiong',
              meta: 'The Prayer Warrior’s Wife · coming soon · 312 waiting',
              tone: 'r',
              action: 'Follow',
            },
          ]}
        />
        <ResultHead title="Clubs" count={2} />
        <ResultList
          query="grace"
          items={[
            {
              kind: 'club',
              id: 'c1',
              title: 'Grace & Glory Readers',
              meta: '1,204 members · reading Harmattan Letters',
              tone: 'g',
              letters: 'GG',
              action: 'Join',
            },
            {
              kind: 'club',
              id: 'c2',
              title: 'Amazing Grace Book Club, Ibadan',
              meta: '318 members · meets Sundays',
              tone: 'k',
              letters: 'AG',
              action: 'Join',
            },
          ]}
        />
      </BodyEnd>
    </>
  );
}

export function NoneSample() {
  return (
    <>
      <SearchBar value="things fall apart" focused={false} />
      <BodyEnd>
        <NoResults query="things fall apart" />
        <SrSection title="You might like" link="Explore" onLink={noop}>
          <Rail label="You might like">
            <BookTile book={{ id: '1', title: 'Seven Bridges to Jos', author: 'Musa Danladi', tone: 'c4' }} />
            <BookTile
              book={{ id: '2', title: 'Harmattan Letters', author: 'Ifeoma Nwachukwu', tone: 'c1' }}
            />
            <BookTile book={{ id: '3', title: 'Ruth of Ibadan', author: 'Tolu Adebayo', tone: 'c5' }} />
          </Rail>
        </SrSection>
      </BodyEnd>
    </>
  );
}

/** The bold sheet's `.pb` laid flat (inline padding 16 18 22, gap 12). */
export function RequestSample() {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(16), paddingHorizontal: s(18), paddingBottom: s(22), gap: s(12) }}>
      <RequestBody name="Ngozi" count={540} query="things fall apart" />
    </View>
  );
}

const NOTIFS: NotifRow[] = [
  {
    id: '1',
    title: 'New in the library.',
    body: 'Bread on Water by Halima Bello is now available.',
    when: '2 h ago',
    unread: true,
    lead: { kind: 'book', title: 'Bread on Water', tone: 'c8' },
  },
  {
    id: '2',
    title: 'New reply to your note.',
    body: 'Hauwa Musa replied to your note in Harmattan Letters.',
    when: '5 h ago',
    unread: true,
    lead: { kind: 'book', title: 'Harmattan Letters', tone: 'c1' },
  },
  {
    id: '3',
    title: 'Ifeoma Nwachukwu posted.',
    body: 'Why Kemi had to take the train.',
    when: '7 h ago',
    unread: true,
    lead: { kind: 'person', name: 'Ifeoma Nwachukwu', tone: 'm' },
  },
  {
    id: '4',
    title: 'Grace Readers.',
    body: 'Amaka: What is everyone reading this weekend?',
    when: '10 h ago',
    unread: false,
    lead: { kind: 'person', name: 'Grace Readers', tone: 'n', square: true },
  },
  {
    id: '5',
    title: 'Reply from Ifeoma Nwachukwu.',
    body: 'She is a little bit of three women I knew in Kano.',
    when: '2 days ago',
    unread: false,
    lead: { kind: 'person', name: 'Ifeoma Nwachukwu', tone: 'm' },
  },
  {
    id: '6',
    title: 'Pick up where you left off.',
    body: 'You are 34% through Harmattan Letters.',
    when: '2 days ago',
    unread: false,
    lead: { kind: 'book', title: 'Harmattan Letters', tone: 'c1' },
  },
  {
    id: '7',
    title: 'Reading challenge.',
    body: 'Finish one book this month to enter the free-year draw.',
    when: '4 days ago',
    unread: false,
    lead: { kind: 'none' },
  },
  {
    id: '8',
    title: 'Coming soon.',
    body: 'Seven Bridges to Jos has a new chapter excerpt.',
    when: '6 days ago',
    unread: false,
    lead: { kind: 'book', title: 'Seven Bridges to Jos', tone: 'c4' },
  },
];

export function NotificationsSample() {
  return (
    <>
      <NotificationsHero unread={3} category="all" />
      <BodyEnd>
        <NotificationFeed rows={NOTIFS} />
      </BodyEnd>
    </>
  );
}
