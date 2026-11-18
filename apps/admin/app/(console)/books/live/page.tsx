import Link from 'next/link';
import { RowLink } from '../row';
import { BooksHeader, FILE_TYPE, Toolbar, bookCounts, clock, coverClass, date } from '../shared';
import { serverSupabase } from '@/lib/supabase/server';

type Status = 'live' | 'scheduled' | 'unpublished' | 'taken_down' | 'rejected';

interface Search {
  status?: string;
  q?: string;
  type?: string;
  genre?: string;
}

const LISTS: Record<Status, { label: string; when: string; st: string; empty: string }> = {
  live: { label: 'Live', when: 'Live since', st: 'st-ok', empty: 'Published books show here.' },
  scheduled: { label: 'Scheduled', when: 'Goes live', st: 'st-info', empty: 'Books scheduled to go live show here.' },
  unpublished: { label: 'Unpublished', when: 'Unpublished', st: '', empty: 'Books taken out of the app show here.' },
  taken_down: { label: 'Taken down', when: 'Taken down', st: 'st-err', empty: 'Books taken down after a report or claim show here.' },
  rejected: { label: 'Rejected', when: 'Rejected', st: 'st-err', empty: 'Books turned down in review show here.' },
};

const REASON: Record<string, string> = {
  author_request: 'Author asked',
  policy_violation: 'Policy violation',
  quality: 'Quality',
};

/** Books · Live (rule 28), and the More lists (Scheduled, Unpublished, Taken down, Rejected). Rows open Revisions. */
export default async function LivePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status: Status = sp.status && sp.status in LISTS ? (sp.status as Status) : 'live';
  const list = LISTS[status];
  const supabase = await serverSupabase();
  const [counts, { data: books, error }] = await Promise.all([
    bookCounts(supabase),
    supabase
      .from('books')
      .select(
        `id, title, genres, current_revision_id, unpublished_at, unpublish_reason, updated_at,
         author:profiles!books_author_id_fkey(full_name)`,
      )
      .eq('status', status),
  ]);
  if (error) throw error;

  // The revision a row describes: the book's current one, else its latest (scheduled or rejected first books).
  const ids = (books ?? []).map(b => b.id);
  const { data: revs, error: revError } = ids.length
    ? await supabase
        .from('book_revisions')
        .select('id, book_id, revision_no, status, source_type, price_credits, published_at, schedule_at, status_reason')
        .in('book_id', ids)
    : { data: [], error: null };
  if (revError) throw revError;
  const pick = new Map<string, NonNullable<typeof revs>[number]>();
  for (const b of books ?? []) {
    const own = (revs ?? []).filter(r => r.book_id === b.id);
    const current = own.find(r => r.id === b.current_revision_id);
    const wanted = status === 'scheduled' || status === 'rejected' ? own.find(r => r.status === status) : undefined;
    const latest = [...own].sort((a, c) => c.revision_no - a.revision_no)[0];
    const rev = wanted ?? current ?? latest;
    if (rev) pick.set(b.id, rev);
  }

  const when = (b: NonNullable<typeof books>[number]) => {
    const rev = pick.get(b.id);
    if (status === 'live') return rev?.published_at ?? null;
    if (status === 'scheduled') return rev?.schedule_at ?? null;
    if (status === 'rejected') return b.updated_at;
    return b.unpublished_at ?? b.updated_at;
  };

  const q = sp.q?.trim().toLowerCase();
  const rows = (books ?? [])
    .filter(b => {
      if (q && !`${b.title} ${b.author?.full_name ?? ''}`.toLowerCase().includes(q)) return false;
      if (sp.type && pick.get(b.id)?.source_type !== sp.type) return false;
      if (sp.genre && !b.genres.includes(sp.genre)) return false;
      return true;
    })
    // Scheduled: soonest first; the rest: most recent first.
    .sort((a, b) => {
      const x = when(a) ?? '';
      const y = when(b) ?? '';
      return status === 'scheduled' ? x.localeCompare(y) : y.localeCompare(x);
    });

  const base = status === 'live' ? '/books/live?' : `/books/live?status=${status}&`;
  const genres = [...new Set((books ?? []).flatMap(b => b.genres))].sort();
  const filters = [
    { href: `${base}type=docx`, label: 'File type: Word' },
    { href: `${base}type=epub`, label: 'File type: EPUB' },
    { href: `${base}type=pdf`, label: 'File type: PDF' },
    ...genres.map(g => ({ href: `${base}genre=${encodeURIComponent(g)}`, label: `Genre: ${g}` })),
  ];
  const total = books?.length ?? 0;
  const third = status === 'live' || status === 'scheduled' ? 'Price' : 'Reason';

  return (
    <section className="screen enter">
      <BooksHeader tab={status === 'live' ? 'live' : 'more'} counts={counts} />
      <div className="page">
        <Toolbar q={sp.q} filters={filters} hidden={status === 'live' ? undefined : { status }} />
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>{`No ${list.label.toLowerCase()} books`}</b>
              <span>{total ? 'No books match. Clear the search or filters to see every book.' : list.empty}</span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Status</th>
                    <th>{third}</th>
                    <th>{list.when}</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(b => {
                    const rev = pick.get(b.id);
                    const href = `/books/${b.id}/revisions`;
                    const at = when(b);
                    const price = rev?.price_credits;
                    const reason =
                      status === 'unpublished' || status === 'taken_down'
                        ? (REASON[b.unpublish_reason ?? ''] ?? rev?.status_reason ?? '—')
                        : (rev?.status_reason ?? '—');
                    return (
                      <RowLink key={b.id} href={href}>
                        <td>
                          <div className="who">
                            <span className={`cv ${coverClass(b.id)} x32`}></span>
                            <span>
                              <b>{b.title}</b>
                              <small>{[b.author?.full_name, FILE_TYPE[rev?.source_type ?? '']].filter(Boolean).join(' · ')}</small>
                            </span>
                          </div>
                        </td>
                        <td className="nw">
                          <span className={`st ${list.st}`.trim()}>{list.label}</span>
                          {rev && <small className="faint">{` r${rev.revision_no}`}</small>}
                        </td>
                        <td className={third === 'Reason' ? 'muted' : 'nw'}>
                          {third === 'Price' ? (price == null ? '—' : price === 0 ? 'Free' : `${price} credits`) : reason}
                        </td>
                        <td className="nw">{at ? (status === 'scheduled' ? `${date(at)}, ${clock(at)}` : date(at)) : '—'}</td>
                        <td className="acts">
                          <Link className="btn btn-s sm" href={href}>
                            Revisions
                          </Link>
                        </td>
                      </RowLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{`${total} ${list.label.toLowerCase()} book${total === 1 ? '' : 's'}`}</span>
            {status === 'scheduled' && <span>Times are WAT</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
