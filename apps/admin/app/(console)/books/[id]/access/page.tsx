import { notFound } from 'next/navigation';
import { AUTHOR_RATE, bookPrice, creditsToNaira } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';
import { date } from '../../shared';
import { BookHead } from '../book-head';
import { AccessOverrides } from './client';

const n0 = (n: number) => n.toLocaleString('en-NG');

interface Access {
  book: { id: string; title: string; status: string };
  revision: {
    id: string;
    revision_no: number;
    words: number | null;
    pages: number | null;
    price: number | null;
    preview_percent: number | null;
    free_through_ord: number;
    published_at: string | null;
    published_by: string | null;
  };
  effective_price: number;
  price_override: { credits: number; reason: string } | null;
  preview_override: { percent: number; reason: string } | null;
  mid_paygo: number;
  can_change_price: boolean;
  can_change_preview: boolean;
  chapters: { chapter_uid: string; ord: number; kind: string; title: string; pages: number; price: number; free: boolean }[];
  history: { at: string; kind: string; old: number | null; new: number | null; reason: string | null; who: string }[];
}

/** "Chapters 3 to 12" over numbered chapters (parts count with their chapter). */
function chapterSpan(chapters: Access['chapters']) {
  let no = 0;
  const numbered = chapters.map(c => ({ ...c, no: c.kind === 'chapter' ? ++no : no }));
  const paid = numbered.filter(c => c.price > 0);
  if (!paid.length) return null;
  const first = paid[0]!.no;
  const last = paid[paid.length - 1]!.no;
  const lo = Math.min(...paid.map(c => c.price));
  const hi = Math.max(...paid.map(c => c.price));
  return {
    span: first === last ? `Chapter ${first}` : `Chapters ${first} to ${last}`,
    each: lo === hi ? `${lo} credits each` : `${lo} to ${hi} credits each`,
    // Chapters before the first paid one cost 0: they sit inside the free preview.
    freeEnd: numbered.filter(c => c.ord < paid[0]!.ord && c.kind === 'chapter').at(-1)?.no ?? 0,
  };
}

/**
 * Pricing and access (s-book-access, flow 03 admin rule 2): the computed price with its working, the
 * pay-as-you-read split, overrides with a reason, and the price history Support reads.
 */
export default async function BookAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const [{ data }, { data: stats }, { data: head }] = await Promise.all([
    supabase.rpc('admin_book_access', { p_book: id }),
    supabase.rpc('admin_book_stats', { p_book: id }),
    supabase
      .from('books')
      .select('genres, author:profiles!books_author_id_fkey(full_name)')
      .eq('id', id)
      .maybeSingle(),
  ]);
  const a = data as Access | null;
  if (!a || !a.revision?.id) notFound();
  const s = (stats ?? {}) as { unlocks_upfront?: number; unlocks_paygo?: number };

  const r = a.revision;
  const words = r.words ?? 0;
  const pages = r.pages ?? 0;
  const computed = r.price ?? bookPrice(pages);
  const price = a.effective_price;
  const split = chapterSpan(a.chapters);
  const up = s.unlocks_upfront ?? 0;
  const go = s.unlocks_paygo ?? 0;
  const total = up + go;
  const pctOf = (n: number) => `${Math.round((n / total) * 100)}%`;
  const preview = Number(a.preview_override?.percent ?? r.preview_percent ?? 10);
  const history = [
    ...(r.published_at
      ? [{ at: r.published_at, what: 'Published', who: r.published_by ?? 'Fast lane', credits: computed }]
      : []),
    ...a.history
      .filter(h => h.kind !== 'preview')
      .map(h => ({
        at: h.at,
        what:
          h.kind === 'override'
            ? `Override: ${h.reason ?? ''}`
            : h.kind === 'computed'
              ? `Override removed: ${h.reason ?? ''}`
              : `New revision: ${h.reason ?? ''}`,
        who: h.who,
        credits: h.new ?? 0,
      })),
    ...a.history
      .filter(h => h.kind === 'preview')
      .map(h => ({ at: h.at, what: h.reason ?? 'Preview changed', who: h.who, credits: null as number | null })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <section className="screen enter">
      <BookHead
        bookId={id}
        title={a.book.title}
        tab="access"
        live={a.book.status === 'live'}
        meta={[
          head?.author?.full_name ?? '',
          head?.genres[0] ?? '',
          `${n0(words)} words`,
          `Revision ${r.revision_no}`,
          r.published_at && a.book.status === 'live' ? `Live since ${date(r.published_at)}` : '',
        ].filter(Boolean)}
        action={
          <button className="btn btn-p" type="submit" form="access-form">
            Save changes
          </button>
        }
      />
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Price</h2>
              </div>
              <div className="panel__body stack s8">
                <div className="mn-rec">
                  <b>{`${n0(words)} words → ${n0(pages)} pages → ${n0(computed)} credits (₦${n0(creditsToNaira(computed))})`}</b>
                  <span>
                    {a.price_override
                      ? `Overridden to ${n0(price)} credits (₦${n0(creditsToNaira(price))}): ${a.price_override.reason}`
                      : '½ credit per standard page, rounded up.'}
                  </span>
                </div>
                <dl className="kv">
                  <dt>Pay upfront</dt>
                  <dd>{`${n0(price)} credits once. The whole book downloads for offline reading.`}</dd>
                  <dt>Pay as you read</dt>
                  <dd>
                    {split
                      ? `${split.span}, ${split.each}, adding up to exactly ${n0(price)}. Unlocked chapters download for offline.`
                      : 'The whole book is inside the free preview, so only Unlock all is offered.'}
                  </dd>
                  <dt>Free preview</dt>
                  <dd>
                    {`First ${preview}%`}
                    {split && split.freeEnd > 0 ? `, ends at the end of chapter ${split.freeEnd}` : ', inside chapter 1'}
                    {a.preview_override ? ` (override: ${a.preview_override.reason})` : ''}
                  </dd>
                  <dt>Readers so far</dt>
                  <dd>{total ? `Upfront ${pctOf(up)} · Pay as you read ${pctOf(go)}` : 'Nobody has unlocked it yet'}</dd>
                  <dt>Author earns</dt>
                  <dd>{`₦${AUTHOR_RATE.toFixed(2)} a credit · ₦${n0(Math.round(price * AUTHOR_RATE))} for a full read`}</dd>
                </dl>
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Chapter prices</h2>
                <span className="sub">{`${a.chapters.length} chapters and parts`}</span>
              </div>
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Chapter</th>
                      <th className="r">Pages</th>
                      <th className="r">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.chapters.map(c => (
                      <tr key={c.chapter_uid}>
                        <td>{c.title}</td>
                        <td className="n">{Number(c.pages).toLocaleString('en-NG', { maximumFractionDigits: 1 })}</td>
                        <td className="n">{c.price === 0 ? 'Free' : n0(c.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Price history</h2>
              </div>
              {history.length ? (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>What changed</th>
                        <th>By</th>
                        <th className="r">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i}>
                          <td>{date(h.at)}</td>
                          <td>{h.what}</td>
                          <td>{h.who}</td>
                          <td className="n">{h.credits === null ? '' : n0(h.credits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <b>No price changes yet</b>
                  <span>Overrides and new revisions show here so Support can explain what a reader paid.</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <AccessOverrides
          bookId={id}
          price={price}
          computed={computed}
          override={a.price_override}
          previewPercent={Number(r.preview_percent ?? 10)}
          previewOverride={a.preview_override}
          midPaygo={a.mid_paygo}
          canPrice={a.can_change_price}
          canPreview={a.can_change_preview}
          chapters={a.chapters.map(c => ({ chapter_uid: c.chapter_uid, ord: c.ord, pages: Number(c.pages), free: c.free }))}
        />
      </div>
    </section>
  );
}
