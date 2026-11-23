// Flow 05 parity pages (tools/parity/s-library*.html): the Library views with the prototype's
// sample values, for `node tools/parity.mjs s-library …` (kit builds only).
import type { ReactNode } from 'react';
import {
  LibGrid,
  LibList,
  LibraryHero,
  OfflineNote,
  ShelfChips,
  ShelfHead,
  type GridBook,
  type RowBook,
  type ShelfName,
} from './LibraryViews';

export const FLOW05_PAGES = [
  's-library',
  's-library-list',
  's-library-saved',
  's-library-finished',
  's-library-offline',
] as const;
export type Flow05Page = (typeof FLOW05_PAGES)[number];

const noop = () => {};
const COUNTS = { reading: 3, saved: 5, finished: 14, offline: 1 };

const HL: GridBook = {
  id: 'hl',
  title: 'Harmattan Letters',
  author: 'Ifeoma Nwachukwu',
  tone: 'c1',
  percent: 34,
};
const READING: GridBook[] = [
  HL,
  { id: 'al', title: 'The Alignment', author: 'Adaeze Rosemary Possible', tone: 'c3', percent: 72 },
  {
    id: 'sb',
    title: 'Seven Bridges to Jos',
    author: 'Musa Danladi',
    tone: 'c4',
    percent: 10,
    state: 'Preview ended',
  },
];
const SAVED: GridBook[] = [
  {
    id: 'gr',
    title: 'A House Called Grace',
    author: 'Kemi Ogunleye',
    tone: 'c6',
    percent: null,
    state: '110 credits',
  },
  {
    id: 'ru',
    title: 'Ruth of Ibadan',
    author: 'Tolu Adebayo',
    tone: 'c5',
    percent: null,
    state: '117 credits',
  },
  {
    id: 'ps',
    title: 'Psalms for the Danfo',
    author: 'Emeka Obi',
    tone: 'c7',
    percent: null,
    state: '44 credits',
  },
  {
    id: 'sw',
    title: 'Still Waters, Lagos',
    author: 'Chioma Okafor',
    tone: 'c2',
    percent: null,
    state: 'Unlocked',
  },
  {
    id: 'bw',
    title: 'Bread on Water',
    author: 'Halima Bello',
    tone: 'c8',
    percent: null,
    state: 'Out 4 December',
  },
];
const FINISHED: GridBook[] = [
  {
    id: 'sw',
    title: 'Still Waters, Lagos',
    author: 'Chioma Okafor',
    tone: 'c2',
    percent: null,
    state: '★ 5 · you rated',
  },
  {
    id: 'ps',
    title: 'Psalms for the Danfo',
    author: 'Emeka Obi',
    tone: 'c7',
    percent: null,
    state: '★ 4 · you rated',
  },
  {
    id: 'ru',
    title: 'Ruth of Ibadan',
    author: 'Tolu Adebayo',
    tone: 'c5',
    percent: null,
    state: 'Rate this book',
  },
];
const ROWS: RowBook[] = [
  {
    id: 'hl',
    title: 'Harmattan Letters',
    author: 'Ifeoma Nwachukwu',
    tone: 'c1',
    status: 'Chapter 7 of 14 · unlocked',
    percent: 34,
    meta: '34% · 2 h 10 min left',
    offline: true,
  },
  {
    id: 'al',
    title: 'The Alignment',
    author: 'Adaeze Rosemary Possible',
    tone: 'c3',
    status: 'Pay as you read · Paid 132 of 184 credits',
    percent: 72,
    meta: '72% · 1 h left',
    action: { kind: 'paygo', label: 'Pay the rest · 52' },
  },
  {
    id: 'sb',
    title: 'Seven Bridges to Jos',
    author: 'Musa Danladi',
    tone: 'c4',
    status: 'Free preview finished',
    percent: 10,
    meta: '10% read',
    action: { kind: 'unlock', label: 'Unlock · 196 credits' },
  },
];

function Frame({ shelf, list, children }: { shelf: ShelfName; list?: boolean; children: ReactNode }) {
  return (
    <>
      <LibraryHero view={list ? 'list' : 'grid'} onView={noop} query="" onQuery={noop} onFilter={noop} />
      <ShelfChips shelf={shelf} counts={COUNTS} onShelf={noop} />
      {children}
    </>
  );
}

export function Flow05({ page }: { page: Flow05Page }) {
  switch (page) {
    case 's-library':
      return (
        <Frame shelf="reading">
          <ShelfHead title="Reading" sub="Last opened first" />
          <LibGrid books={READING} onOpen={noop} onMore={noop} />
        </Frame>
      );
    case 's-library-list':
      return (
        <Frame shelf="reading" list>
          <LibList rows={ROWS} onOpen={noop} onAction={noop} />
        </Frame>
      );
    case 's-library-saved':
      return (
        <Frame shelf="saved">
          <ShelfHead title="Saved" sub="5 books" />
          <LibGrid books={SAVED} onOpen={noop} onMore={noop} />
        </Frame>
      );
    case 's-library-finished':
      return (
        <Frame shelf="finished">
          <ShelfHead title="Finished" sub="14 books this year" />
          <LibGrid books={FINISHED} onOpen={noop} onMore={noop} />
        </Frame>
      );
    case 's-library-offline':
      return (
        <Frame shelf="offline">
          <ShelfHead title="Offline downloads" sub="1 book · 4 MB" />
          <LibGrid books={[{ ...HL, state: 'Ready offline · 6 days left' }]} onOpen={noop} onMore={noop} />
          <OfflineNote />
        </Frame>
      );
  }
}
