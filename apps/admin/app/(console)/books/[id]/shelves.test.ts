import { describe, expect, it } from 'vitest';
import { shelfRows, type ShelfInput } from './shelves';

const sections = [
  { id: 's-tr', key: 'trending', title: 'Trending this week' },
  { id: 's-au', key: 'authors', title: 'Arpedia authors' },
  { id: 's-na', key: 'new_arrivals', title: 'New arrivals' },
  { id: 's-t10', key: 'top10', title: 'Top 10 books' },
  { id: 's-cs', key: 'coming_soon', title: 'Coming soon' },
];
const base: ShelfInput = {
  bookId: 'b1',
  sections,
  items: [],
  top10Rank: null,
  comingAt: null,
  comingListed: false,
  newUntil: null,
  genre: null,
  now: Date.parse('2026-11-27T12:00:00Z'),
};

describe('shelfRows', () => {
  it('is empty when the book is on no shelf', () => {
    expect(shelfRows(base)).toEqual([]);
  });

  it('lists every placement in the Home order, with Edit where curation changes it', () => {
    const rows = shelfRows({
      ...base,
      items: [{ section_id: 's-tr', position: 1, pinned: true, excluded: false }],
      top10Rank: 1,
      newUntil: '2026-12-10T10:00:00Z',
      genre: { name: 'Christian & Faith', position: 1 },
    });
    expect(rows).toEqual([
      { key: 'trending', title: 'Trending this week', detail: 'Pinned at position 2', edit: '/curation/trending' },
      { key: 'new_arrivals', title: 'New arrivals', detail: 'Until 10 Dec 2026' },
      { key: 'top10', title: 'Top 10 books', detail: 'Rank 1, automatic from the last 7 days', edit: undefined },
      { key: 'genre', title: 'Genre shelf: Christian & Faith', detail: 'Position 1, sorted by reads' },
    ]);
  });

  it('says when a book is hidden from a shelf or pinned in Top 10', () => {
    const hidden = shelfRows({ ...base, items: [{ section_id: 's-t10', position: 0, pinned: false, excluded: true }] });
    expect(hidden).toEqual([{ key: 'top10', title: 'Top 10 books', detail: 'Hidden from this shelf', edit: '/curation' }]);
    const pinned = shelfRows({
      ...base,
      items: [{ section_id: 's-t10', position: 1, pinned: true, excluded: false }],
      top10Rank: 1,
    });
    expect(pinned).toEqual([{ key: 'top10', title: 'Top 10 books', detail: 'Rank 1, pinned', edit: '/curation' }]);
  });

  it('shows a Coming soon entry and an unpinned shelf position', () => {
    const rows = shelfRows({
      ...base,
      comingListed: true,
      comingAt: '2026-12-20T07:00:00Z',
      items: [{ section_id: 's-au', position: 3, pinned: false, excluded: false }],
    });
    expect(rows).toEqual([
      { key: 'authors', title: 'Arpedia authors', detail: 'Position 4', edit: '/curation' },
      { key: 'coming_soon', title: 'Coming soon', detail: 'Releases 20 Dec 2026', edit: '/curation/coming?book=b1' },
    ]);
    expect(shelfRows({ ...base, comingListed: true }).map(r => r.detail)).toEqual(['Releases when it goes live']);
  });

  it('drops a finished New arrivals window', () => {
    expect(shelfRows({ ...base, newUntil: '2026-11-01T00:00:00Z' })).toEqual([]);
  });
});
