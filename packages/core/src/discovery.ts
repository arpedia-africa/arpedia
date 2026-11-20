// Discovery rules shared by the app and admin (docs/prd/02-discovery.md). The SQL in
// supabase/migrations/*_02_discovery.sql mirrors normalizeQuery, lengthBand and trimSnippet.
import { WORDS_PER_MINUTE } from './unlock';

/** Longest query we search or store. */
export const MAX_QUERY = 80;
/** Shortest query we search, suggest or log. */
export const MIN_QUERY = 2;
/** Distinct searchers in 7 days before a query is trending (Default Q8). */
export const TRENDING_MIN_SEARCHERS = 20;
/** Longest story snippet in results. */
export const SNIPPET_MAX = 120;

/** Trim, lowercase, drop accents, collapse spaces, cut to 80 characters. */
export function normalizeQuery(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY)
    .trim();
}

/** True when a query is long enough to search (and to log). */
export const isSearchable = (q: string) => normalizeQuery(q).length >= MIN_QUERY;

export type LengthBand = 'short' | 'medium' | 'long';

/** Length bands by stored price: under 150 pages (< 75 cr), 150–300 (75–149 cr), 300+ (150+ cr). */
export function lengthBand(priceCredits: number): LengthBand {
  if (priceCredits < 75) return 'short';
  if (priceCredits < 150) return 'medium';
  return 'long';
}

/** Filter-sheet labels: pages are credits × 2 so they always agree with pricing. */
export const LENGTH_BANDS: { key: LengthBand; label: string; sub: string }[] = [
  { key: 'short', label: 'Under 150 pages', sub: 'Up to 75 credits' },
  { key: 'medium', label: '150 to 300 pages', sub: '75 to 150 credits' },
  { key: 'long', label: '300+ pages', sub: '150 credits and up' },
];

export type Movement = { kind: 'up' | 'down'; by: number } | { kind: 'same' } | { kind: 'new' };

/** Top 10 movement against last week's rank (null or outside the top 10 = New). */
export function movement(rank: number, prevRank: number | null | undefined): Movement {
  if (prevRank == null || prevRank > 10) return { kind: 'new' };
  if (prevRank === rank) return { kind: 'same' };
  return prevRank > rank ? { kind: 'up', by: prevRank - rank } : { kind: 'down', by: rank - prevRank };
}

/** The movement badge text: ▲ n, ▼ n, — or New. */
export function movementLabel(m: Movement): string {
  if (m.kind === 'up') return `▲ ${m.by}`;
  if (m.kind === 'down') return `▼ ${m.by}`;
  return m.kind === 'same' ? '—' : 'New';
}

/** "Good morning" until 11:59, "Good afternoon" until 16:59, then "Good evening". */
export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Whole hours of reading, at least 1. */
export function hoursRead(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE / 60));
}

/**
 * Recommended for you score: w × share of picked genres the book matches + (1 − w) × popularity.
 * popularity = 1 − (rank − 1) ÷ total (0 when unranked). No picks: popularity only.
 */
export function recommendationScore(
  bookGenres: string[],
  picks: string[],
  rank: number | null,
  total: number,
  w = 0.6,
): number {
  const pop = rank == null ? 0 : 1 - (rank - 1) / Math.max(total, 1);
  if (picks.length === 0) return pop;
  const p = new Set(picks.map((g) => g.toLowerCase()));
  const matched = new Set(bookGenres.map((g) => g.toLowerCase()).filter((g) => p.has(g))).size;
  return w * (matched / p.size) + (1 - w) * pop;
}

/** One sentence around the first match, at most 120 characters, with … where cut. */
export function trimSnippet(text: string, word: string): string | null {
  const t = text.replace(/\s+/g, ' ');
  const pos = word ? t.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (pos < 0) return null;
  let s = pos;
  while (s > 0 && !'.!?'.includes(t[s - 1]!)) s--;
  let e = pos + word.length;
  while (e < t.length && !'.!?'.includes(t[e]!)) e++;
  const sentence = t.slice(s, e + 1).trim();
  if (sentence.length <= SNIPPET_MAX) return sentence;
  const at = sentence.toLowerCase().indexOf(word.toLowerCase());
  const start = Math.max(0, Math.min(at - 50, sentence.length - (SNIPPET_MAX - 3)));
  const head = start > 0 ? '…' : '';
  const body = sentence.slice(start + (head ? 1 : 0), start + SNIPPET_MAX - 2).trim();
  const tail = start + SNIPPET_MAX - 3 < sentence.length ? '…' : '';
  return head + body + tail;
}

/** True when a query qualifies as trending this week. */
export const isTrending = (searchers: number, resultCount: number) =>
  searchers >= TRENDING_MIN_SEARCHERS && resultCount > 0;

/** "2.4k searches this week" (1,000 and up in k with one decimal). */
export function searchesLabel(n: number): string {
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toString()}k searches this week`;
  return `${n} searches this week`;
}
