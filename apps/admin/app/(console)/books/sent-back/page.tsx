import { BooksHeader, FILE_TYPE, ago, bookCounts, coverClass, lagosDay, latestOnly } from '../shared';
import { Remind } from './remind';
import { serverSupabase } from '@/lib/supabase/server';

/** "2 issues · chapter titles, cover too small", or the note when there is no list. */
function summary(issues: unknown, note: string | null) {
  const texts = (Array.isArray(issues) ? issues : [])
    .map(i => String((i as { text?: unknown })?.text ?? '').trim().replace(/\.$/, ''))
    .filter(Boolean)
    .map(t => (/^[A-Z][a-z]/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t));
  if (!texts.length) return note ?? '';
  return `${texts.length} issue${texts.length === 1 ? '' : 's'} · ${texts.join(', ')}`;
}

/** Books · Sent back (s-books-sentback): books waiting on their authors, with Remind. */
export default async function SentBackPage() {
  const supabase = await serverSupabase();
  const [counts, { data, error }] = await Promise.all([
    bookCounts(supabase),
    supabase
      .from('book_revisions')
      .select(
        `id, book_id, revision_no, source_type,
         book:books!book_revisions_book_id_fkey(id, title, author:profiles!books_author_id_fkey(full_name)),
         sends:send_backs!send_backs_revision_id_fkey(issues, note, sent_at, reminded_at)`,
      )
      .eq('status', 'sent_back'),
  ]);
  if (error) throw error;

  const now = Date.now();
  const today = lagosDay(now);
  const yesterday = lagosDay(now - 86_400_000);
  const rows = (await latestOnly(supabase, data ?? []))
    .map(r => ({ ...r, send: [...r.sends].sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0] }))
    .sort((a, b) => (b.send?.sent_at ?? '').localeCompare(a.send?.sent_at ?? ''));

  return (
    <section className="screen enter">
      <BooksHeader tab="sentback" counts={counts} />
      <div className="page">
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>No books with their authors</b>
              <span>Books you send back wait here until the author uploads a new file.</span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>What the author must fix</th>
                    <th>Sent back</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const author = r.book?.author?.full_name ?? '';
                    const at = r.send?.reminded_at;
                    const recent = !!at && now - new Date(at).getTime() < 86_400_000;
                    const day = at ? lagosDay(at) : '';
                    const reminded = recent
                      ? day === today
                        ? 'Reminded today'
                        : day === yesterday
                          ? 'Reminded yesterday'
                          : 'Reminded'
                      : undefined;
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="who">
                            <span className={`cv ${coverClass(r.book?.id ?? r.id)} x32`}></span>
                            <span>
                              <b>{r.book?.title}</b>
                              <small>{`${author} · ${FILE_TYPE[r.source_type ?? ''] ?? ''}`}</small>
                            </span>
                          </div>
                        </td>
                        <td className="muted">{summary(r.send?.issues, r.send?.note ?? null)}</td>
                        <td className="nw">{ago(r.send?.sent_at ?? null, now)}</td>
                        <td className="acts">
                          <Remind revisionId={r.id} firstName={author.split(' ')[0] ?? ''} reminded={reminded} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{`${rows.length} book${rows.length === 1 ? '' : 's'} with their authors`}</span>
            <span>Authors get an automatic reminder after 7 days</span>
          </div>
        </div>
      </div>
    </section>
  );
}
