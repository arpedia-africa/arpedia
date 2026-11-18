import Link from 'next/link';
import { RowLink } from './row';
import { BooksHeader, FILE_TYPE, Toolbar, bookCounts, coverClass, initials, waited } from './shared';
import { serverSupabase } from '@/lib/supabase/server';

interface Search {
  q?: string;
  type?: string;
  nobody?: string;
  late?: string;
  genre?: string;
}

const meterClass = (score: number) => (score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'err');

/** Books · Needs you (s-books): Needs fixes and Ready for review, oldest promise first. */
export default async function BooksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await serverSupabase();
  const [counts, { data, error }] = await Promise.all([
    bookCounts(supabase),
    supabase
      .from('book_revisions')
      .select(
        `id, status, source_type, readiness, routed_at, due_at, base_revision_id,
         book:books!book_revisions_book_id_fkey(id, title, genres, author:profiles!books_author_id_fkey(full_name)),
         assignee:profiles!book_revisions_assigned_to_fkey(full_name),
         flags:book_flags!book_flags_revision_id_fkey(count),
         diff:revision_diffs!revision_diffs_revision_id_fkey(changed_pct)`,
      )
      .in('status', ['needs_fixes', 'ready_for_review'])
      .eq('flags.status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false }),
  ]);
  if (error) throw error;

  const now = Date.now();
  const q = sp.q?.trim().toLowerCase();
  const rows = (data ?? []).filter(r => {
    const author = r.book?.author?.full_name ?? '';
    if (q && !`${r.book?.title ?? ''} ${author}`.toLowerCase().includes(q)) return false;
    if (sp.type && r.source_type !== sp.type) return false;
    if (sp.nobody && r.assignee) return false;
    if (sp.late && !(r.due_at && new Date(r.due_at).getTime() < now)) return false;
    if (sp.genre && !r.book?.genres.includes(sp.genre)) return false;
    return true;
  });
  const genres = [...new Set((data ?? []).flatMap(r => r.book?.genres ?? []))].sort();
  const filters = [
    { href: '/books?type=docx', label: 'File type: Word' },
    { href: '/books?type=epub', label: 'File type: EPUB' },
    { href: '/books?type=pdf', label: 'File type: PDF' },
    { href: '/books?nobody=1', label: 'Nobody on it' },
    { href: '/books?late=1', label: 'Late only' },
    ...genres.map(g => ({ href: `/books?genre=${encodeURIComponent(g)}`, label: `Genre: ${g}` })),
  ];

  return (
    <section className="screen enter">
      <BooksHeader tab="needs" counts={counts} />
      <div className="page">
        <Toolbar q={sp.q} filters={filters} />
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>All caught up</b>
              <span>
                {data?.length
                  ? 'No books match. Clear the search or filters to see every book.'
                  : 'Books that need fixing or reviewing will show here.'}
              </span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Stage</th>
                    <th>Readiness</th>
                    <th>Waiting</th>
                    <th>On it</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const update = !!r.base_revision_id;
                    const fixes = r.status === 'needs_fixes';
                    const href = fixes ? `/books/${r.id}/fix` : update ? `/books/${r.id}/revisions` : `/books/${r.id}/review`;
                    const action = fixes ? 'Fix' : update ? 'Compare' : 'Review';
                    const flags = r.flags[0]?.count ?? 0;
                    const score = r.readiness ?? 0;
                    const late = !!r.due_at && new Date(r.due_at).getTime() < now;
                    const pct = r.diff?.changed_pct;
                    const assignee = r.assignee?.full_name;
                    return (
                      <RowLink key={r.id} href={href}>
                        <td>
                          <div className="who">
                            <span className={`cv ${coverClass(r.book?.id ?? r.id)} x32`}></span>
                            <span>
                              <b>{r.book?.title}</b>
                              <small>
                                {update && pct != null
                                  ? `Update · ${Number(pct).toLocaleString('en-NG', { maximumFractionDigits: 1 })}% changed`
                                  : `${r.book?.author?.full_name ?? ''} · ${FILE_TYPE[r.source_type ?? '']}`}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td className="nw">{fixes ? 'Needs fixes' : update ? 'Update to review' : 'Ready for review'}</td>
                        <td>
                          <span className="score">
                            <span className="meter">
                              <i className={meterClass(score)} style={{ ['--v' as string]: `${score}%` }}></i>
                            </span>
                            {score}% {flags > 0 && <small>{`${flags} flag${flags === 1 ? '' : 's'}`}</small>}
                          </span>
                        </td>
                        <td className="nw">{late ? <b className="warn-t">{waited(r.routed_at, now)}</b> : waited(r.routed_at, now)}</td>
                        <td>
                          {assignee ? (
                            <div className="who">
                              <span className={`av xs ${coverClass(assignee).endsWith('1') ? 't' : 'b'}`}>{initials(assignee)}</span>
                              <span>
                                <small>{assignee.split(' ')[0]}</small>
                              </span>
                            </div>
                          ) : (
                            <span className="faint">Nobody</span>
                          )}
                        </td>
                        <td className="acts">
                          <Link className="btn btn-s sm" href={href}>
                            {action}
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
            <span>
              {counts.needs} book{counts.needs === 1 ? '' : 's'} need{counts.needs === 1 ? 's' : ''} a person · {counts.processing} processing ·{' '}
              {counts.sentback} with their authors
            </span>
            <span>Fix within 2 days · review within 3</span>
          </div>
        </div>
      </div>
    </section>
  );
}
