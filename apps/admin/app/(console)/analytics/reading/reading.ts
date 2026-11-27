/** The Reading tab's figures from `staff_analytics_reading` (flow 15 rule 27, spec check 15-24). */

export interface Reading {
  kpis: {
    /** Null until the app sends pages with each session, or under 5 sessions. */
    pages_per_session: number | null;
    pages_per_session_prev: number | null;
    /** Null until the app sends offline with each session. */
    offline_share: number | null;
    highlights: number;
    highlights_per_finished: number | null;
    discussions: number;
    /** Null for fewer than 5 readers. */
    discussion_readers: number | null;
  };
  how_far: {
    readers: number;
    /** Null for fewer than 5 readers. */
    bands: { label: string; share: number }[] | null;
    by_length: { label: string; avg: number | null }[];
  };
  books: {
    id: string;
    title: string;
    author: string;
    highlights: number;
    discussions: number;
    replies: number;
    offline: number | null;
  }[];
  paragraphs: {
    book_id: string;
    title: string;
    quote: string | null;
    chapter: number | null;
    comments: number;
    highlights: number;
  }[];
  rooms: {
    stayed_pct: number | null;
    rows: {
      id: string;
      name: string;
      held: string;
      joined: number | null;
      stayed_pct: number | null;
      messages: number;
      unlocks: number | null;
    }[];
  };
}

export const EMPTY: Reading = {
  kpis: {
    pages_per_session: null,
    pages_per_session_prev: null,
    offline_share: null,
    highlights: 0,
    highlights_per_finished: null,
    discussions: 0,
    discussion_readers: null,
  },
  how_far: { readers: 0, bands: null, by_length: [] },
  books: [],
  paragraphs: [],
  rooms: { stayed_pct: null, rows: [] },
};

const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-NG');

/** "+1" / "-0.5" against the previous period, or null when either side is missing. */
export function pagesDelta(now: number | null, before: number | null): { text: string; up: boolean } | null {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  return { text: `${d >= 0 ? '+' : ''}${one(d)}`, up: d >= 0 };
}

/** "12.6 per finished book" or "1,820 readers took part"; null when the figure is hidden. */
export const perFinished = (n: number | null) => (n == null ? null : `${one(n)} per finished book`);
export const tookPart = (n: number | null) => (n == null ? null : `${Math.round(n).toLocaleString('en-NG')} readers took part`);

/** "Wed 11 Nov, 19:00" in Lagos time. */
export function held(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return `${day.replace(',', '')}, ${time}`;
}

/** "chapter 6 · 412 comments · 1,180 highlights" */
export function paragraphHint(p: Reading['paragraphs'][number]): string {
  const n = (v: number, w: string) => `${v.toLocaleString('en-NG')} ${w}${v === 1 ? '' : 's'}`;
  return [p.chapter == null ? null : `chapter ${p.chapter}`, n(p.comments, 'comment'), n(p.highlights, 'highlight')]
    .filter(Boolean)
    .join(' · ');
}
