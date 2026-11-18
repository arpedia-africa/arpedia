import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bookPrice, creditsToNaira } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';
import { coverClass, date } from '../shared';
import { BookHead } from './book-head';
import { ToastButton } from './book-menu';

const n0 = (n: number) => n.toLocaleString('en-NG');

/**
 * Book detail (s-book, flow 03 admin rule 1): details, description, cover, Discover placement and the
 * community/moderation fold. Editing details or the cover makes a new revision (flow 12).
 */
export default async function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const { data: book } = await supabase
    .from('books')
    .select(
      `id, title, subtitle, description, genres, status, author_id, current_revision_id, comments_count,
       author:profiles!books_author_id_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!book) notFound();

  const [{ data: rev }, { count: authorLive }, { data: stats }, { data: eff }, { count: open }, { count: closed }] =
    await Promise.all([
      book.current_revision_id
        ? supabase
            .from('book_revisions')
            .select('revision_no, words, pages, price_credits, published_at, age_rating, created_at, cover_key')
            .eq('id', book.current_revision_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('books').select('id', { count: 'exact', head: true }).eq('author_id', book.author_id).eq('status', 'live'),
      supabase.from('book_rating_stats').select('avg, count').eq('book_id', id).maybeSingle(),
      supabase.from('book_effective').select('effective_price').eq('book_id', id).maybeSingle(),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('target_type', 'book').eq('target_id', id).eq('status', 'open'),
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('target_type', 'book')
        .eq('target_id', id)
        .neq('status', 'open')
        .gte('created_at', new Date(Date.now() - 90 * 864e5).toISOString()),
    ]);

  const title = book.title;
  const author = book.author?.full_name ?? '';
  const price = eff?.effective_price ?? rev?.price_credits ?? null;
  const computed = rev?.pages != null ? bookPrice(rev.pages) : null;
  const meta = [
    author,
    book.genres[0] ?? '',
    rev?.words != null ? `${n0(rev.words)} words` : '',
    rev ? `Revision ${rev.revision_no}` : 'No live revision',
    book.status === 'live' && rev?.published_at ? `Live since ${date(rev.published_at)}` : statusWord(book.status),
  ].filter(Boolean);

  return (
    <section className="screen enter">
      <BookHead
        bookId={id}
        title={title}
        tab="details"
        meta={meta}
        live={book.status === 'live'}
        action={
          <ToastButton
            className="btn btn-p"
            label="Edit details"
            message={`Changes to ${title} are saved as a new revision; readers keep the current one until it is published.`}
          />
        }
      />
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Details</h2>
              </div>
              <div className="panel__body">
                <dl className="kv">
                  <dt>Title</dt>
                  <dd>{title}</dd>
                  {book.subtitle && (
                    <>
                      <dt>Subtitle</dt>
                      <dd>{book.subtitle}</dd>
                    </>
                  )}
                  <dt>Author</dt>
                  <dd>
                    <span className="link">{author}</span>
                    {` · ${n0(authorLive ?? 0)} book${authorLive === 1 ? '' : 's'} live`}
                  </dd>
                  {book.genres.length > 0 && (
                    <>
                      <dt>Genres</dt>
                      <dd>
                        <span className="ct-tags">
                          {book.genres.map((g, i) => (
                            <span key={g} className={i === 0 ? 'tag org' : 'tag'}>
                              {g}
                            </span>
                          ))}
                        </span>
                      </dd>
                    </>
                  )}
                  {rev?.words != null && rev.pages != null && price != null && (
                    <>
                      <dt>Price</dt>
                      <dd>
                        {`${n0(rev.words)} words → ${n0(rev.pages)} pages → `}
                        <b>{`${n0(price)} credits`}</b>
                        {` (₦${n0(creditsToNaira(price))})${price !== computed ? ' · override' : ''} · upfront or pay as you read`}
                      </dd>
                    </>
                  )}
                  {rev?.age_rating && (
                    <>
                      <dt>Age rating</dt>
                      <dd>{rev.age_rating}</dd>
                    </>
                  )}
                  {rev?.published_at && (
                    <>
                      <dt>Published</dt>
                      <dd>{`${date(rev.published_at)} · current revision r${rev.revision_no}`}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Description</h2>
              </div>
              <div className="panel__body">
                {book.description ? <p>{book.description}</p> : <span className="muted">No description yet.</span>}
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Cover</h2>
              </div>
              <div className="panel__body">
                <div className="ct-cover">
                  <span className={`cv ${coverClass(id)} x120`}>
                    <b>{title}</b>
                    <small>{author}</small>
                  </span>
                  <div className="stack s8">
                    <span>{rev?.cover_key ? <b>Uploaded cover</b> : <b>No cover uploaded</b>}</span>
                    {rev?.created_at && <span className="muted">{`Uploaded ${date(rev.created_at)}`}</span>}
                    <ToastButton
                      className="btn btn-g sm"
                      label="Replace cover"
                      message="A new cover comes with a new revision: upload it under Books → Upload a book."
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>On the Discover shelves</h2>
              </div>
              <div className="empty">
                <b>Not on any shelf yet</b>
                <span>Shelves and Trending placements show here once Discover curation is set up.</span>
              </div>
            </div>
          </div>
        </div>
        <details className="fold">
          <summary>
            More details <small>community, moderation, history</small>
          </summary>
          <div className="fold__b">
            <div className="ct-stat">
              <div>
                <b>{n0(book.comments_count)}</b>
                <small>Comments in the book room</small>
              </div>
              <div>
                <b>{stats ? Number(stats.avg).toFixed(1) : '0.0'}</b>
                <small>Rating</small>
              </div>
              <div>
                <b>{n0(stats?.count ?? 0)}</b>
                <small>Reviews</small>
              </div>
            </div>
            <div className="kv-row">
              <span>Open reports on this book</span>
              <b>{n0(open ?? 0)}</b>
            </div>
            <div className="kv-row">
              <span>Closed in the last 90 days</span>
              <b>{n0(closed ?? 0)}</b>
            </div>
            <Link className="link" href={`/books/${id}/revisions`}>
              See every revision
            </Link>
          </div>
        </details>
      </div>
    </section>
  );
}

function statusWord(status: string) {
  return (
    { draft: 'Draft', scheduled: 'Coming soon', unpublished: 'Unpublished', taken_down: 'Taken down', rejected: 'Rejected' }[
      status
    ] ?? ''
  );
}
