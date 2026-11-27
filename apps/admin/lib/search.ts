import { naira } from '@arpedia/core';
import { canOpen } from './nav';

/**
 * s-cmdk · Search everything: records found for a query, grouped as in the prototype
 * (Readers, Authors, Books, Payments). Each group is searched only when the staff member's role
 * can open its page, and through that page's own query, so RLS and RPC checks stay the same.
 */
export type SearchKind = 'readers' | 'authors' | 'books' | 'payments';

export interface SearchHit {
  id: string;
  href: string;
  title: string;
  detail: string;
  trail: string;
  /** Initials and avatar tone for people (`.av.sm.<tone>`). */
  avatar?: { text: string; tone: string };
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
}

/** The page each group's records open, which also decides who may search it. */
export const SEARCH_PAGES: Record<SearchKind, { page: string; label: string }> = {
  readers: { page: 'users', label: 'Readers' },
  authors: { page: 'applications', label: 'Authors' },
  books: { page: 'books', label: 'Books' },
  payments: { page: 'transactions', label: 'Payments' },
};

/** Hits per group, as in the prototype's short lists. */
export const SEARCH_LIMIT = 3;

/** The groups this role can search, in the prototype's order. */
export const searchKinds = (permissions: readonly string[]) =>
  (Object.keys(SEARCH_PAGES) as SearchKind[]).filter(k => canOpen(SEARCH_PAGES[k].page, permissions));

/**
 * The query as it is safe to search: letters, digits, spaces and the few marks in emails,
 * phone numbers and store ids (`.`, `@`, `_`, `-`, `+`); at most 80 characters; null when
 * shorter than 2 characters.
 */
export function searchTerm(raw: string): string | null {
  const t = raw
    .replace(/[^\p{L}\p{N} @._+-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return t.length >= 2 ? t : null;
}

const TONES = ['g', 't', 'b', 'm', 'k', 'r', 'o', 'n'] as const;
/** The same stable tone the Readers and Authors lists give a person. */
export const tone = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('') || '?';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2 Nov", Lagos time. */
const dayMonth = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const ACTIVE = ['active', 'grace', 'billing_retry'];
const n0 = (n: number) => n.toLocaleString('en-NG');

export interface ReaderRow {
  id: string;
  name: string | null;
  email: string | null;
  country: string | null;
  plan: { plan: string; status: string } | null;
  deleted: boolean;
}

/** "Ngozi Eze" · "ngozi.eze@gmail.com · Quarterly plan · NG". */
export function readerHit(r: ReaderRow, countryName: (code: string | null) => string): SearchHit {
  const name = r.name?.trim() || r.email || 'Reader';
  const plan = r.deleted
    ? 'Deleted'
    : r.plan && ACTIVE.includes(r.plan.status)
      ? `${cap(r.plan.plan)} plan`
      : r.plan
        ? `${cap(r.plan.plan)} plan · lapsed`
        : 'No plan';
  return {
    id: r.id,
    href: `/users/${r.id}`,
    title: name,
    detail: [r.email, plan, r.country ? countryName(r.country) : null].filter(Boolean).join(' · '),
    trail: 'Reader',
    avatar: { text: initials(name), tone: tone(r.id) },
  };
}

export interface AuthorRow {
  user_id: string;
  pen_name: string;
  status: 'active' | 'suspended';
  books_live: number;
}

/** "Ngozi Adichie-Bello" · "3 books live · 1,240 followers". */
export function authorHit(a: AuthorRow, followers: number): SearchHit {
  const books = `${n0(a.books_live)} ${a.books_live === 1 ? 'book' : 'books'} live`;
  const fans = `${n0(followers)} ${followers === 1 ? 'follower' : 'followers'}`;
  return {
    id: a.user_id,
    href: `/authors/${a.user_id}`,
    title: a.pen_name,
    detail: [books, fans, a.status === 'suspended' ? 'Suspended' : null].filter(Boolean).join(' · '),
    trail: 'Author',
    avatar: { text: initials(a.pen_name), tone: tone(a.user_id) },
  };
}

/** Matching authors by pen name, most books live first. */
export const matchAuthors = (rows: AuthorRow[], term: string) => {
  const t = term.toLowerCase();
  return rows
    .filter(a => a.pen_name.toLowerCase().includes(t))
    .sort((a, b) => b.books_live - a.books_live || a.pen_name.localeCompare(b.pen_name))
    .slice(0, SEARCH_LIMIT);
};

const BOOK_STATUS: Record<string, string> = {
  draft: 'Draft',
  live: 'Live',
  scheduled: 'Scheduled',
  unpublished: 'Unpublished',
  taken_down: 'Taken down',
  rejected: 'Rejected',
};

export interface BookRow {
  id: string;
  title: string;
  status: string;
  author: { full_name: string | null } | null;
}

/** "Kano Nights" · "Amina Bello · Live". */
export const bookHit = (b: BookRow): SearchHit => ({
  id: b.id,
  href: `/books/${b.id}`,
  title: b.title,
  detail: [b.author?.full_name, BOOK_STATUS[b.status] ?? cap(b.status)].filter(Boolean).join(' · '),
  trail: 'Book',
});

const PLATFORM: Record<string, string> = { play: 'Google Play', app_store: 'App Store', web: 'Web' };

export interface PaymentRow {
  id: string;
  created_at: string;
  kind: string;
  plan_code: string | null;
  topup_code: string | null;
  store: string;
  store_txn_id: string;
  gross_kobo: number;
  status: string;
  user: { full_name: string | null } | null;
}

/** "₦2,400 Quarterly plan · Google Play" · "GPA.3391-… · Ngozi Eze · 2 Nov". */
export function paymentHit(p: PaymentRow): SearchHit {
  const item = p.kind === 'plan' ? `${cap(p.plan_code ?? '')} plan`.trim() : 'Top-up';
  const status = p.status === 'succeeded' ? null : cap(p.status);
  return {
    id: p.id,
    href: `/transactions/${p.id}`,
    title: `${naira(p.gross_kobo)} ${item} · ${PLATFORM[p.store] ?? p.store}`,
    detail: [p.store_txn_id, p.user?.full_name, dayMonth(p.created_at), status].filter(Boolean).join(' · '),
    trail: 'Transaction',
  };
}
