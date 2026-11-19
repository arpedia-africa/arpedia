// Flow 02 screens with the prototype's values (tools/parity/s-home.html), for app/parity.tsx.
import { Section } from '@arpedia/ui';
import type { CoverTone } from '@arpedia/ui';
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
