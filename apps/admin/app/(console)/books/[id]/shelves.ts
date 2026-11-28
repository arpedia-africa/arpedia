import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arpedia/core';

/** One line of "On the Discover shelves" on the book detail page (s-book). */
export interface ShelfRow {
  key: string;
  title: string;
  detail: string;
  /** The curation page that changes this placement, when there is one. */
  edit?: string;
}

export interface ShelfInput {
  bookId: string;
  /** Home sections by key (`trending`, `top10`, …) with their app titles. */
  sections: { id: string; key: string; title: string }[];
  /** shelf_items rows for this book (staff also see excluded rows); positions count from 0. */
  items: { section_id: string; position: number; pinned: boolean; excluded: boolean }[];
  /** The book's rank in get_top10(), if it is in the Top 10 now. */
  top10Rank: number | null;
  /** Its Coming soon entry, if any. */
  comingAt: string | null | undefined;
  comingListed: boolean;
  /** books.new_arrival_until. */
  newUntil: string | null;
  /** Main genre and the book's position on that genre's shelf (live books, most read first). */
  genre: { name: string; position: number } | null;
  now?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "9 Nov 2026", Lagos time. */
const day = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Where each section's placements are changed in Discover curation. */
const EDIT: Record<string, (bookId: string) => string> = {
  trending: () => '/curation/trending',
  coming_soon: bookId => `/curation/coming?book=${bookId}`,
};

/**
 * Every Discover placement of the book, in the app's Home order: curated shelves (pinned, position
 * or hidden), Top 10, New arrivals, Coming soon and its genre shelf.
 */
export function shelfRows(i: ShelfInput): ShelfRow[] {
  const now = i.now ?? Date.now();
  const byId = new Map(i.sections.map(s => [s.id, s]));
  const title = (key: string, fallback: string) => i.sections.find(s => s.key === key)?.title ?? fallback;
  const rows: ShelfRow[] = [];

  for (const it of i.items) {
    const s = byId.get(it.section_id);
    if (!s || s.key === 'coming_soon') continue;
    // Top 10 shows its live rank below; only a hidden book needs its own line.
    if (s.key === 'top10' && !it.excluded) continue;
    rows.push({
      key: `${s.key}`,
      title: s.title,
      detail: it.excluded
        ? 'Hidden from this shelf'
        : it.pinned
          ? `Pinned at position ${it.position + 1}`
          : `Position ${it.position + 1}`,
      edit: (EDIT[s.key] ?? (() => '/curation'))(i.bookId),
    });
  }
  if (i.top10Rank != null) {
    const pinned = i.items.some(it => byId.get(it.section_id)?.key === 'top10' && it.pinned && !it.excluded);
    rows.push({
      key: 'top10',
      title: title('top10', 'Top 10'),
      detail: `Rank ${i.top10Rank}, ${pinned ? 'pinned' : 'automatic from the last 7 days'}`,
      edit: pinned ? '/curation' : undefined,
    });
  }
  if (i.newUntil && new Date(i.newUntil).getTime() > now) {
    rows.push({ key: 'new_arrivals', title: title('new_arrivals', 'New arrivals'), detail: `Until ${day(i.newUntil)}` });
  }
  if (i.comingListed) {
    rows.push({
      key: 'coming_soon',
      title: title('coming_soon', 'Coming soon'),
      detail: i.comingAt ? `Releases ${day(i.comingAt)}` : 'Releases when it goes live',
      edit: EDIT.coming_soon!(i.bookId),
    });
  }
  if (i.genre) {
    rows.push({
      key: 'genre',
      title: `Genre shelf: ${i.genre.name}`,
      detail: `Position ${i.genre.position.toLocaleString('en-NG')}, sorted by reads`,
    });
  }
  const order = ['trending', 'authors', 'new_arrivals', 'top10', 'recommended', 'coming_soon', 'genre'];
  return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

type Supa = SupabaseClient<Database>;

/** Reads every placement for the book as the signed-in staff member. */
export async function loadShelves(
  supabase: Supa,
  book: { id: string; status: string; genres: string[] },
): Promise<ShelfRow[]> {
  const live = book.status === 'live';
  const genre = live ? (book.genres[0] ?? null) : null;
  const [sections, items, top10, coming, nb] = await Promise.all([
    supabase.from('home_sections').select('id, key, title'),
    supabase.from('shelf_items').select('section_id, position, pinned, excluded').eq('item_type', 'book').eq('item_id', book.id),
    live ? supabase.rpc('get_top10') : Promise.resolve({ data: [] }),
    supabase.from('coming_soon_entries').select('release_at').eq('book_id', book.id).maybeSingle(),
    supabase.from('books').select('new_arrival_until, reads_count, claim_hold_at').eq('id', book.id).maybeSingle(),
  ]);
  let genrePos: { name: string; position: number } | null = null;
  // The genre shelf lists live books of the genre, most read first (held books are off Discover).
  if (genre && nb.data && !nb.data.claim_hold_at) {
    const { count } = await supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'live')
      .is('claim_hold_at', null)
      .contains('genres', [genre])
      .gt('reads_count', nb.data.reads_count);
    genrePos = { name: genre, position: (count ?? 0) + 1 };
  }
  const rank = ((top10.data ?? []) as unknown as { id: string; rank: number }[]).find(b => b.id === book.id)?.rank ?? null;
  return shelfRows({
    bookId: book.id,
    sections: sections.data ?? [],
    items: items.data ?? [],
    top10Rank: rank,
    comingListed: !!coming.data,
    comingAt: coming.data?.release_at,
    newUntil: nb.data?.new_arrival_until ?? null,
    genre: genrePos,
  });
}
