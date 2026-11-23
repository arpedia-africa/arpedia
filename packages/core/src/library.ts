// Flow 05 · Library maths shared by the app's mirror and tests: shelf classification (rules 2–6),
// time left (rule 15), offline days left (rule 27), sorting (rule 10) and page merging (rule 35).
import { WORDS_PER_MINUTE } from './unlock';

export type Shelf = 'reading' | 'saved' | 'finished' | 'offline';
export type LibrarySort = 'last_opened' | 'title' | 'progress';

/** One book as get_library returns it (and the SQLite mirror stores it). */
export interface LibraryItem {
  book_id: string;
  title: string;
  author_name: string | null;
  cover_key: string | null;
  percent: number;
  max_percent: number;
  chapter_uid: string | null;
  chapter_ord: number;
  chapters_total: number;
  pages: number | null;
  last_opened_at: string | null;
  finished_at: string | null;
  owns_book: boolean;
  paid_credits: number;
  price_credits: number | null;
  remaining_credits: number;
  preview_percent: number | null;
  preview_ended: boolean;
  coming_soon_at: string | null;
  gift_from_name: string | null;
  my_stars: number | null;
  words_left: number;
  unpublished: boolean;
  shelves: { reading: boolean; saved: boolean; finished: boolean };
}

export interface ShelfFacts {
  /** A reading_progress row exists. */
  opened: boolean;
  max_percent: number;
  finished_at: string | null;
  owns_book: boolean;
  /** A saved_books row exists. */
  saved_row: boolean;
  /** Hidden from Saved (Remove from Saved on an owned, unopened book). */
  hidden: boolean;
}

/** Account shelves of one book, by the server's rules (so local changes update counts at once). */
export function shelvesOf(f: ShelfFacts): { reading: boolean; saved: boolean; finished: boolean } {
  const finished = f.opened && f.finished_at != null;
  return {
    reading: f.opened && !finished && f.max_percent > 0,
    saved: f.saved_row || (f.owns_book && !f.opened && !f.hidden),
    finished,
  };
}

/** "2 h 10 min left", "1 h left", "25 min left", "Less than a minute left" (230 wpm). */
export function bookTimeLeft(wordsLeft: number): string {
  const total = Math.floor(Math.max(0, wordsLeft) / WORDS_PER_MINUTE);
  if (total < 1) return 'Less than a minute left';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min left`;
  return m === 0 ? `${h} h left` : `${h} h ${m} min left`;
}

const DAY = 86_400_000;

/** Offline state line (rule 27): days left rounded down, under 24 h "Less than a day left". */
export function offlineLine(validUntil: number, now: number): { expired: boolean; label: string } {
  const left = validUntil - now;
  if (left <= 0) return { expired: true, label: 'Expired · connect to refresh' };
  const days = Math.floor(left / DAY);
  if (days < 1) return { expired: false, label: 'Ready offline · Less than a day left' };
  return { expired: false, label: `Ready offline · ${days} ${days === 1 ? 'day' : 'days'} left` };
}

/** "12 MB" / "3.4 MB" (0 or 1 decimal, rule 26). */
export function formatMB(bytes: number): string {
  const mb = bytes / 1_048_576;
  const r = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${r.toLocaleString('en-NG')} MB`;
}

const time = (s: string | null) => (s ? Date.parse(s) : 0);

/**
 * Sort as the server does (rule 10): Last opened (newest first, default), Title (A to Z), Progress
 * (highest first). Finished sorts by finish date unless Title or Progress is chosen. Ties by id.
 */
export function compareItems(shelf: Shelf, sort: LibrarySort) {
  return (a: LibraryItem, b: LibraryItem): number => {
    const d =
      sort === 'title'
        ? a.title.toLowerCase().localeCompare(b.title.toLowerCase())
        : sort === 'progress'
          ? b.percent - a.percent
          : shelf === 'finished'
            ? time(b.finished_at) - time(a.finished_at)
            : time(b.last_opened_at) - time(a.last_opened_at);
    if (d !== 0) return d;
    return sort === 'title' ? (a.book_id < b.book_id ? -1 : 1) : a.book_id < b.book_id ? 1 : -1;
  };
}

/** Infinite scroll: append a page, dropping books already shown (a book can move between pages). */
export function mergePage(shown: LibraryItem[], page: LibraryItem[]): LibraryItem[] {
  const seen = new Set(shown.map((i) => i.book_id));
  return [...shown, ...page.filter((i) => !seen.has(i.book_id))];
}

/** On-device search (rule 9): title or author, case and accent insensitive. */
export function matchesQuery(item: Pick<LibraryItem, 'title' | 'author_name'>, query: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return true;
  return norm(item.title).includes(q) || norm(item.author_name ?? '').includes(q);
}

/** List-row status line by payment state (rule 15). */
export function paymentLine(i: LibraryItem): string {
  if (i.owns_book) return `Chapter ${Math.max(1, i.chapter_ord)} of ${i.chapters_total} · unlocked`;
  if (i.paid_credits > 0)
    return `Pay as you read · Paid ${i.paid_credits.toLocaleString('en-NG')} of ${(i.price_credits ?? 0).toLocaleString('en-NG')} credits`;
  if (i.preview_ended) return 'Free preview finished';
  return `Chapter ${Math.max(1, i.chapter_ord)} of ${i.chapters_total}`;
}
