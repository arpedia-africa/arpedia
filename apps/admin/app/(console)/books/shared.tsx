import Link from 'next/link';
import { Icon } from '@/components/icon';
import type { serverSupabase } from '@/lib/supabase/server';
import { Menu } from './menu';

export type Supa = Awaited<ReturnType<typeof serverSupabase>>;
export type Tab = 'needs' | 'processing' | 'sentback' | 'live';

export const FILE_TYPE: Record<string, string> = { docx: 'Word', epub: 'EPUB', pdf: 'PDF' };

/** Until covers are resized (Notes), a book shows one of the prototype's cover styles, fixed per book. */
export function coverClass(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `c${[1, 3, 4, 5, 6, 7, 8][h % 7]}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');

/** "5 hours", "1 day", "4 days" since a time. */
export function waited(since: string | null, now = Date.now()) {
  if (!since) return '';
  const h = Math.max(0, Math.floor((now - new Date(since).getTime()) / 3_600_000));
  if (h < 1) return 'Just now';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/** "3 days ago", "5 hours ago", "Just now". */
export function ago(since: string | null, now = Date.now()) {
  const w = waited(since, now);
  return w && w !== 'Just now' ? `${w} ago` : w;
}

/** 09:38, Lagos time. */
export const clock = (at: string) =>
  new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

/** The Lagos calendar day of a time, as YYYY-MM-DD. */
export const lagosDay = (at: string | number) =>
  new Date(at).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

/** Keep only revisions that are still their book's latest (a resubmission replaces a sent-back one). */
export async function latestOnly<T extends { book_id: string; revision_no: number }>(supabase: Supa, rows: T[]) {
  if (!rows.length) return rows;
  const { data: all } = await supabase
    .from('book_revisions')
    .select('book_id, revision_no')
    .in('book_id', [...new Set(rows.map(r => r.book_id))]);
  const latest = new Map<string, number>();
  for (const r of all ?? []) latest.set(r.book_id, Math.max(latest.get(r.book_id) ?? 0, r.revision_no));
  return rows.filter(r => latest.get(r.book_id) === r.revision_no);
}

/** Where a Needs you book opens: Fix flagged issues, Revisions (an update) or Quick review. */
export const reviewHref = (r: { id: string; status: string; base_revision_id: string | null }) =>
  r.status === 'needs_fixes'
    ? `/books/${r.id}/fix`
    : r.base_revision_id
      ? `/books/${r.id}/revisions`
      : `/books/${r.id}/review`;

/** "Book 2 of 7 in Needs you" and where Skip goes, for the decision bar. */
export async function queuePosition(supabase: Supa, id: string) {
  const { data } = await supabase
    .from('book_revisions')
    .select('id, status, base_revision_id')
    .in('status', ['needs_fixes', 'ready_for_review'])
    .order('due_at', { ascending: true, nullsFirst: false });
  const list = data ?? [];
  const at = Math.max(0, list.findIndex(r => r.id === id));
  const next = list.length > 1 ? list[(at + 1) % list.length]! : null;
  return { position: at + 1, total: list.length, skipHref: next ? reviewHref(next) : '/books' };
}

export interface Counts {
  needs: number;
  processing: number;
  sentback: number;
  live: number;
  scheduled: number;
  unpublished: number;
  takenDown: number;
  rejected: number;
}

/** Tab counts for the Books header. A sent-back revision counts while it is its book's latest. */
export async function bookCounts(supabase: Supa): Promise<Counts> {
  const revs = (statuses: ('needs_fixes' | 'ready_for_review' | 'processing' | 'with_desk')[]) =>
    supabase.from('book_revisions').select('id', { count: 'exact', head: true }).in('status', statuses);
  const books = (status: 'live' | 'scheduled' | 'unpublished' | 'taken_down' | 'rejected') =>
    supabase.from('books').select('id', { count: 'exact', head: true }).eq('status', status);
  const [needs, processing, sent, live, scheduled, unpublished, takenDown, rejected] = await Promise.all([
    revs(['needs_fixes', 'ready_for_review']),
    revs(['processing', 'with_desk']),
    supabase.from('book_revisions').select('book_id, revision_no').eq('status', 'sent_back'),
    books('live'),
    books('scheduled'),
    books('unpublished'),
    books('taken_down'),
    books('rejected'),
  ]);
  const sentback = (await latestOnly(supabase, sent.data ?? [])).length;
  return {
    needs: needs.count ?? 0,
    processing: processing.count ?? 0,
    sentback,
    live: live.count ?? 0,
    scheduled: scheduled.count ?? 0,
    unpublished: unpublished.count ?? 0,
    takenDown: takenDown.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}

/** The Books band, tabs and toolbar (s-books, s-book-processing, s-books-sentback). */
export function BooksHeader({ tab, counts }: { tab: Tab; counts: Counts }) {
  const t = (key: Tab, href: string, label: string, n: number) => (
    <Link role="tab" aria-selected={tab === key} href={href}>
      {label} <span className="c">{n}</span>
    </Link>
  );
  return (
    <>
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Books</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/books/new">
              <Icon name="plus" size="s" />
              New book
            </Link>
            <Link className="ib" href="/exports" aria-label="Export books">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {t('needs', '/books', 'Needs you', counts.needs)}
        {t('processing', '/books/processing', 'Processing', counts.processing)}
        {t('sentback', '/books/sent-back', 'Sent back', counts.sentback)}
        {t('live', '/books/live', 'Live', counts.live)}
        <Menu
          tab
          trigger={
            <>
              More
              <Icon name="chevd" size="xs" />
            </>
          }
        >
          <Link href="/books/live?status=scheduled">Scheduled · {counts.scheduled}</Link>
          <Link href="/books/live?status=unpublished">Unpublished · {counts.unpublished}</Link>
          <Link href="/books/live?status=taken_down">Taken down · {counts.takenDown}</Link>
          <Link href="/books/live?status=rejected">Rejected · {counts.rejected}</Link>
        </Menu>
      </div>
    </>
  );
}

export function Toolbar({ q, filters }: { q?: string; filters?: { href: string; label: string }[] }) {
  return (
    <form className="toolbar" action="" method="get">
      <label className="search">
        <Icon name="search" size="s" />
        <input name="q" defaultValue={q} placeholder="Title or author" aria-label="Search books" />
      </label>
      {filters && (
        <Menu
          left
          trigger={
            <>
              <Icon name="filter" />
              Filters
            </>
          }
        >
          {filters.map(f => (
            <Link key={f.href} href={f.href}>
              {f.label}
            </Link>
          ))}
        </Menu>
      )}
    </form>
  );
}
