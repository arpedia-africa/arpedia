import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { serverSupabase } from '@/lib/supabase/server';
import { FILE_TYPE, coverClass, queuePosition, waited } from '../../shared';
import { loadWork, type Work } from '../../work';
import { Claim, ReviewDecide } from './client';

const n0 = (n: number) => n.toLocaleString('en-NG');
const day = (at: string) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const WORDS_PER_PAGE = 250;

/** The eight automated checks in plain names (rule 35), each with the flag kinds that fail it. */
const CHECKS: { name: string; keys: string[] }[] = [
  { name: 'Formatting', keys: ['chapter_title', 'repeated_text', 'image_too_large', 'copyright_missing'] },
  {
    name: 'Chapters',
    keys: ['toc_mismatch', 'chapter_detection_failed', 'low_structure_confidence', 'pdf_source', 'too_short'],
  },
  { name: 'Cover', keys: ['cover_too_small', 'cover_aspect'] },
  { name: 'Preview cut', keys: [] },
  { name: 'Paragraph links', keys: [] },
  { name: 'File check', keys: ['file_check_error'] },
  { name: 'Plagiarism', keys: ['plagiarism_high', 'plagiarism_medium'] },
  { name: 'Content policy', keys: ['policy_hit', 'policy_borderline'] },
];

interface Page {
  chapter: string;
  label: string;
  title: string;
  paras: string[];
  page: number;
  state: string;
  cut?: string;
}

type Chapter = { chapter_uid: string; ord: number; kind: string; title: string; words_before: number };

/** The first readable paragraphs of a working-copy chapter, from `from` (block index). */
function paras(work: Work, ci: number, from = 0, count = 2) {
  return (work.chapters[ci]?.blocks ?? [])
    .slice(from)
    .filter(b => !b.sceneBreak && !b.images?.some(m => m.alone) && !/^<h[1-6]/i.test(b.html) && b.text.trim())
    .slice(0, count)
    .map(b => b.text);
}

/** First page, a middle page and the page at the preview cut, as readers see them (rule 35). */
function spotPages(
  work: Work | null,
  chapters: Chapter[],
  cut: { uid: string | null; para: string | null; percent: number | null; words: number },
): Page[] | null {
  if (!work || !chapters.length) return null;
  const numbered = chapters.filter(c => c.kind === 'chapter');
  const no = (c: Chapter) => numbered.indexOf(c) + 1;
  const at = (c: Chapter) => Math.max(0, work.anchors.uids.indexOf(c.chapter_uid));
  const pageOf = (words: number) => Math.floor(words / WORDS_PER_PAGE) + 1;
  const first = numbered[0] ?? chapters[0]!;
  const middle = numbered[Math.floor(numbered.length / 2)] ?? first;
  const cutCh = chapters.find(c => c.chapter_uid === cut.uid) ?? first;
  const ci = at(cutCh);
  const bi = cut.para ? Math.max(0, (work.anchors.ids[ci] ?? []).indexOf(cut.para)) : 0;
  const before = (work.chapters[ci]?.blocks ?? [])
    .slice(0, bi + 1)
    .filter(b => !b.sceneBreak && !b.images?.some(m => m.alone) && !/^<h[1-6]/i.test(b.html) && b.text.trim())
    .slice(-2)
    .map(b => b.text);
  const pct = (cut.percent ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 1 });
  const endsChapter = bi >= (work.chapters[ci]?.blocks.length ?? 1) - 1;
  const where = endsChapter ? `the end of chapter ${no(cutCh)}` : `chapter ${no(cutCh)}`;
  return [
    { chapter: `Chapter ${no(first)}`, label: 'First page', title: first.title, paras: paras(work, at(first)), page: pageOf(first.words_before), state: 'Free preview' },
    { chapter: `Chapter ${no(middle)}`, label: 'Middle page', title: middle.title, paras: paras(work, at(middle)), page: pageOf(middle.words_before), state: 'Unlocked' },
    {
      chapter: `Chapter ${no(cutCh)}`,
      label: 'Preview cut',
      title: cutCh.title,
      paras: before,
      page: Math.max(1, Math.ceil((cut.words * (cut.percent ?? 0)) / 100 / WORDS_PER_PAGE)),
      state: 'Preview ends',
      cut: `Free preview ends here, at ${where} (${pct}%)`,
    },
  ];
}

/** Quick review (s-book-preview): the system has checked everything; staff spot-check (rule 35). */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const [{ data: rev }, { data: flags }, { data: chapters }, anchors, queue] = await Promise.all([
    supabase
      .from('book_revisions')
      .select(
        `id, status, source_type, words, pages, price_credits, readiness, routed_at, chapters_confirmed_at,
         preview_percent, preview_cut_para_id, preview_cut_chapter_uid, base_revision_id, meta, assigned_to,
         assignee:profiles!book_revisions_assigned_to_fkey(full_name),
         book:books!book_revisions_book_id_fkey(id, title, genres, author:profiles!books_author_id_fkey(full_name))`,
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('book_flags').select('check_key, message').eq('revision_id', id).eq('status', 'open'),
    supabase
      .from('chapters')
      .select('chapter_uid, ord, kind, title, words_before')
      .eq('revision_id', id)
      .order('ord'),
    supabase.from('paragraph_anchors').select('para_id', { count: 'exact', head: true }).eq('revision_id', id),
    queuePosition(supabase, id),
  ]);
  if (!rev) notFound();
  if (rev.status === 'needs_fixes') redirect(`/books/${id}/fix`);
  if (rev.status !== 'ready_for_review') redirect('/books');

  const work = await loadWork(id);
  const open = flags ?? [];
  const title = rev.book?.title ?? '';
  const author = rev.book?.author?.full_name ?? '';
  const chs = (chapters ?? []) as Chapter[];
  const numbered = chs.filter(c => c.kind === 'chapter').length;
  const cutCh = chs.find(c => c.chapter_uid === rev.preview_cut_chapter_uid);
  const cutNo = cutCh ? chs.filter(c => c.kind === 'chapter').indexOf(cutCh) + 1 : 0;
  const pct = (rev.preview_percent ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 1 });
  const links = anchors.count ?? 0;
  const meta = (rev.meta ?? {}) as { description?: string; content_notes?: string; age?: string; language?: string };

  const results = CHECKS.map(c => {
    const hit = open.filter(f => c.keys.includes(f.check_key));
    let detail: string;
    if (hit.length) detail = hit.map(f => f.message).join(' ');
    else if (c.name === 'Formatting') detail = 'headings, scene breaks and quotes render correctly';
    else if (c.name === 'Chapters')
      detail = rev.chapters_confirmed_at
        ? `${numbered} found, confirmed by the author on ${day(rev.chapters_confirmed_at)}`
        : `${numbered} found`;
    else if (c.name === 'Cover') detail = 'readable as a thumbnail';
    else if (c.name === 'Preview cut')
      detail = rev.preview_cut_para_id ? `in chapter ${cutNo} (${pct}%), at a paragraph end` : 'not set yet';
    else if (c.name === 'Paragraph links')
      detail = links ? `${n0(links)} set, so highlights and discussions survive updates` : 'not set yet';
    else if (c.name === 'File check') detail = 'opens correctly on every device';
    else if (c.name === 'Plagiarism') detail = 'no close match found';
    else detail = 'no explicit content, threats or personal data';
    const ok = !hit.length && !(c.name === 'Preview cut' && !rev.preview_cut_para_id) && !(c.name === 'Paragraph links' && !links);
    return { ...c, ok, detail };
  });
  const passed = results.filter(r => r.ok).length;
  const pages = spotPages(work, chs, {
    uid: rev.preview_cut_chapter_uid,
    para: rev.preview_cut_para_id,
    percent: rev.preview_percent,
    words: rev.words ?? 0,
  });
  const naira = (rev.price_credits ?? 0) * 3;

  return (
    <section className="screen enter">
      <Claim revisionId={id} unassigned={!rev.assigned_to} />
      <div className="ph">
        <div className="crumbs">
          <Link href="/books">Books</Link>
          <Icon name="chev" size="s" />
          <span>Quick review</span>
        </div>
        <div className="ph__row">
          <span className={`cv ${coverClass(rev.book?.id ?? id)} x56`}>
            <b>{title}</b>
          </span>
          <div className="ph__title">
            <h1>{title}</h1>
            <div className="ph__meta">
              <span>{author}</span>
              <span>{FILE_TYPE[rev.source_type ?? ''] ?? ''}</span>
              <span>{`Readiness ${rev.readiness ?? 0}%`}</span>
              <span>{`Waiting ${waited(rev.routed_at)}`}</span>
              {rev.assignee?.full_name && <span>{`On it: ${rev.assignee.full_name}`}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="stack s16">
          <details className="fold">
            <summary>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: passed === CHECKS.length ? 'var(--ok)' : 'var(--warn)',
                  flex: '0 0 auto',
                }}
              ></span>
              {passed === CHECKS.length
                ? `All ${CHECKS.length} automated checks passed`
                : `${passed} of ${CHECKS.length} automated checks passed`}{' '}
              <small>{`readiness ${rev.readiness ?? 0}%, ${open.length ? `${open.length} flag${open.length === 1 ? '' : 's'}` : 'no flags'}`}</small>
            </summary>
            <div className="fold__b">
              {results.map(r => (
                <div className="kv-row" key={r.name}>
                  <span>{r.name}</span>
                  <b style={{ textAlign: 'right', fontWeight: 500 }}>{r.detail}</b>
                </div>
              ))}
              <details className="fold">
                <summary>
                  Technical details <small>file build and checker output</small>
                </summary>
                <div className="fold__b">
                  <div className="kv-row">
                    <span>Book file</span>
                    <b>EPUB 3</b>
                  </div>
                  <div className="kv-row">
                    <span>File check</span>
                    <b>
                      {open.some(f => f.check_key === 'file_check_error')
                        ? `${open.filter(f => f.check_key === 'file_check_error').length} errors`
                        : '0 errors'}
                    </b>
                  </div>
                  <div className="kv-row">
                    <span>Paragraph anchors</span>
                    <b>{links ? `${n0(links)} generated, all unique` : 'none yet'}</b>
                  </div>
                </div>
              </details>
            </div>
          </details>
          <div className="panel">
            <div className="panel__head">
              <h2>Spot-check on a phone</h2>
              <span className="sub">This is what readers see</span>
            </div>
            <div className="panel__body">
              {!pages ? (
                <div className="empty" style={{ padding: '48px 16px' }}>
                  <b>The pages could not be loaded</b>
                  <span>Check your connection and reload. The checks above still apply.</span>
                </div>
              ) : (
                <div className="ct-phones">
                  {pages.map(p => (
                    <div className="ct-pwrap" key={p.label}>
                      <div className="phone">
                        <div className="phone__s">
                          <div className="ct-rbar">
                            <span>{title}</span>
                            <span>{p.chapter}</span>
                          </div>
                          <div className="ct-reader">
                            <h4>{p.title}</h4>
                            {p.paras.map((t, i) => (
                              <p key={i}>{t}</p>
                            ))}
                            {p.cut && <div className="ct-cut">{p.cut}</div>}
                          </div>
                          <div className="ct-rfoot">
                            <div className="meter">
                              <i></i>
                            </div>
                            <div className="row between">
                              <span>{`Page ${p.page} of ${rev.pages ?? 0}`}</span>
                              <span>{p.state}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <b>{p.label}</b>
                      <small>{p.label === 'Preview cut' ? (p.cut?.includes('end of') ? 'End of a chapter, not mid-scene' : 'At a paragraph end') : p.chapter}</small>
                    </div>
                  ))}
                  <div className="ct-pwrap">
                    <div className="phone">
                      <div className="phone__s">
                        <div className="ct-rbar">
                          <span>Book page</span>
                          <span>{`${n0(rev.price_credits ?? 0)} credits · or pay as you read`}</span>
                        </div>
                        <div className="ct-reader" style={{ alignItems: 'center', justifyContent: 'center' }}>
                          <span className={`cv ${coverClass(rev.book?.id ?? id)} x160`}>
                            <b>{title}</b>
                            <small>{author}</small>
                          </span>
                        </div>
                      </div>
                    </div>
                    <b>Cover on phone</b>
                    <small>{results[2]!.ok ? 'Readable as a thumbnail' : 'Flagged: check it'}</small>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel__head">
              <h2>Book details</h2>
            </div>
            <div className="panel__body">
              <dl className="kv tight">
                <dt>Title</dt>
                <dd>{title}</dd>
                <dt>Author</dt>
                <dd>{author}</dd>
                <dt>Genre</dt>
                <dd>{(rev.book?.genres ?? []).join(', ')}</dd>
                <dt>Length</dt>
                <dd>
                  {`${n0(rev.words ?? 0)} words → ${n0(rev.pages ?? 0)} pages → `}
                  <b>{`${n0(rev.price_credits ?? 0)} credits`}</b>
                  {` (₦${n0(naira)})`}
                </dd>
                {meta.description && (
                  <>
                    <dt>Description</dt>
                    <dd>{meta.description}</dd>
                  </>
                )}
                {meta.content_notes && (
                  <>
                    <dt>Content notes</dt>
                    <dd>{meta.content_notes}</dd>
                  </>
                )}
                {meta.age && (
                  <>
                    <dt>Age</dt>
                    <dd>{meta.age}</dd>
                  </>
                )}
                {meta.language && (
                  <>
                    <dt>Language</dt>
                    <dd>{meta.language}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
      <ReviewDecide revisionId={id} position={queue.position} total={queue.total} skipHref={queue.skipHref} />
    </section>
  );
}
