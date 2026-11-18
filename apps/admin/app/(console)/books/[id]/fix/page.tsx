import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { serverSupabase } from '@/lib/supabase/server';
import { FILE_TYPE, coverClass, dayMonth as day, queuePosition, waited } from '../../shared';
import { loadWork } from '../../work';
import { Decide, DownloadOriginal, FixShell, FlagActions } from './client';

/** Plain names for the checks (rule 24). */
const TITLE: Record<string, string> = {
  image_too_large: 'Image is too large',
  chapter_title: 'Chapter title unclear',
  repeated_text: 'Repeated text',
  copyright_missing: 'Copyright page missing',
  cover_too_small: 'Cover is too small',
  cover_aspect: 'Cover is an unusual shape',
  toc_mismatch: 'Chapters differ from the contents',
  pdf_source: 'Made from a PDF',
  low_structure_confidence: 'Chapters may be off',
  too_short: 'Book is too short',
  file_check_error: 'File problem',
  chapter_detection_failed: 'Chapters not found',
  plagiarism_high: 'Very similar to another book',
  plagiarism_medium: 'Similar to another book',
  policy_hit: 'Breaks the content policy',
  policy_borderline: 'Close to the content policy',
};

/** What Accept suggestion did, for the toast. */
const DONE: Record<string, string> = {
  shrink_image: 'Image shrunk',
  set_heading: 'The title is now a heading',
  rename_chapter: 'Chapter renamed',
  merge_chapter_up: 'Chapter joined to the one before',
  remove_paragraph: 'Repeated paragraphs removed',
  insert_copyright_page: 'Copyright page added',
  dismiss_flag: 'Left as it is',
};

const OPS = new Set(Object.keys(DONE));

type Location = { chapter_uid?: string; para_id?: string; image?: string };

const n0 = (n: number) => n.toLocaleString('en-NG');
/** "2.4 MB"; small files in KB, so a 30 KB file doesn't read "0 MB". */
const mb = (bytes: number) =>
  bytes < 102_400
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1_048_576).toLocaleString('en-NG', { maximumFractionDigits: 1 })} MB`;
const meterClass = (score: number) => (score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'err');

/** Fix flagged issues (s-book-formatter): staff fix only what the system flagged (rules 29–33). */
export default async function FixPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flag?: string; ch?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await serverSupabase();
  const [{ data: rev }, { data: flags }, { data: chapters }, queue, { data: config }] = await Promise.all([
    supabase
      .from('book_revisions')
      .select(
        `id, status, source_type, file_bytes, words, pages, price_credits, readiness, routed_at, work_version,
         chapters_confirmed_at, base_revision_id,
         book:books!book_revisions_book_id_fkey(id, title, author:profiles!books_author_id_fkey(full_name))`,
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('book_flags')
      .select('id, check_key, message, suggestion, location, fix_op, blocking, weight')
      .eq('revision_id', id)
      .eq('status', 'open')
      .order('blocking', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase.from('chapters').select('chapter_uid, ord, title, words').eq('revision_id', id).order('ord'),
    queuePosition(supabase, id),
    supabase.from('pipeline_config').select('value').eq('key', 'thresholds').maybeSingle(),
  ]);
  if (!rev) notFound();
  if (rev.status !== 'needs_fixes') redirect(rev.base_revision_id ? `/books/${id}/revisions` : `/books/${id}/review`);

  const work = await loadWork(id);
  const open = flags ?? [];
  const ready = Number((config?.value as { ready_score?: number } | null)?.ready_score ?? 90);
  const author = rev.book?.author?.full_name ?? '';
  const first = author.split(' ')[0] ?? '';
  const score = rev.readiness ?? 0;
  const blocking = open.some(f => f.blocking);

  const active = open.find(f => f.id === sp.flag) ?? open[0];
  const loc = (active?.location ?? {}) as Location;
  const uid = sp.ch ?? loc.chapter_uid ?? work?.anchors.uids[0] ?? chapters?.[0]?.chapter_uid;
  const ci = work && uid ? Math.max(0, work.anchors.uids.indexOf(uid)) : 0;
  const chapter = work?.chapters[ci];
  // ords start at 0; numbered as in the flag messages ("Chapter 2 has no title").
  const chNo = (chapters?.find(c => c.chapter_uid === uid)?.ord ?? ci) + 1;
  const flagged = new Set(open.flatMap(f => ((f.location as Location)?.para_id ? [(f.location as Location).para_id!] : [])));
  const flaggedImages = new Set(open.flatMap(f => ((f.location as Location)?.image ? [(f.location as Location).image!] : [])));

  const coverOk = !open.some(f => f.check_key.startsWith('cover_'));
  const shown = (chapters ?? []).slice(0, 12);
  const pdfHeavy = rev.source_type === 'pdf' && open.length >= 5;

  return (
    <FixShell>
      <section className="screen enter">
        <div className="ph">
          <div className="crumbs">
            <Link href="/books">Books</Link>
            <Icon name="chev" size="s" />
            <span>Fix flagged issues</span>
          </div>
          <div className="ph__row">
            <span className={`cv ${coverClass(rev.book?.id ?? id)} x56`}>
              <b>{rev.book?.title}</b>
            </span>
            <div className="ph__title">
              <h1>{rev.book?.title}</h1>
              <div className="ph__meta">
                <span>{author}</span>
                <span>{FILE_TYPE[rev.source_type ?? ''] ?? ''}</span>
                <span>{`${n0(rev.words ?? 0)} words · ${n0(rev.pages ?? 0)} pages`}</span>
                <span>{`Needs fixes · waiting ${waited(rev.routed_at)}`}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="page">
          <div className="ct-fix">
            <div className="stack s16">
              <div className="panel">
                <div className="panel__head">
                  <h2>{open.length ? `${open.length} thing${open.length === 1 ? '' : 's'} to fix` : 'Nothing left to fix'}</h2>
                  <span className="sub">Found by the system</span>
                </div>
                <div>
                  {open.length === 0 && (
                    <div className="empty" style={{ padding: '32px 16px' }}>
                      <b>All flags cleared</b>
                      <span>Mark it fixed and send it to review below.</span>
                    </div>
                  )}
                  {open.map((f, i) => {
                    const l = (f.location ?? {}) as Location;
                    const op = (f.fix_op as { op?: string } | null)?.op;
                    const canAccept = !!op && OPS.has(op);
                    const chUid = l.chapter_uid ?? (f.fix_op as { chapter_uid?: string } | null)?.chapter_uid;
                    const chTitle = chapters?.find(c => c.chapter_uid === chUid)?.title ?? '';
                    return (
                      <div key={f.id} className={`ct-flag${f.id === active?.id ? ' is-active' : ''}`} id={`flag-${f.id}`}>
                        <b>{`${i + 1}. ${TITLE[f.check_key] ?? f.check_key.replace(/_/g, ' ')}`}</b>
                        <p>{f.message}</p>
                        {f.suggestion && (
                          <p>
                            <b style={{ fontSize: 13 }}>Suggested fix:</b>{' '}
                            {f.suggestion.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase())}
                          </p>
                        )}
                        <FlagActions
                          revisionId={id}
                          flagId={f.id}
                          n={i + 1}
                          version={rev.work_version}
                          canAccept={canAccept}
                          done={DONE[op ?? ''] ?? 'Fixed'}
                          rename={f.check_key === 'chapter_title' && chUid ? { chapterUid: chUid, title: chTitle } : undefined}
                          jump={`/books/${id}/fix?flag=${f.id}${chUid ? `&ch=${chUid}` : ''}${l.para_id ? `#${l.para_id}` : ''}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <details className="fold">
                <summary>
                  All chapters{' '}
                  <small>
                    {rev.chapters_confirmed_at
                      ? `${chapters?.length ?? 0} confirmed by the author`
                      : `${chapters?.length ?? 0} found`}
                  </small>
                </summary>
                <div className="fold__b">
                  <div className="chapters">
                    {shown.map(c => (
                      <Link
                        key={c.chapter_uid}
                        className={`chap${c.chapter_uid === uid ? ' is-active' : ''}`}
                        href={`/books/${id}/fix?${active ? `flag=${active.id}&` : ''}ch=${c.chapter_uid}`}
                        scroll={false}
                      >
                        <span className="n">{c.ord}</span>
                        {c.title}
                        <small>{n0(c.words)}</small>
                      </Link>
                    ))}
                    {(chapters?.length ?? 0) > shown.length && (
                      <div className="chap">
                        <span className="n">…</span>
                        {`${(chapters?.length ?? 0) - shown.length} more chapters`}
                        <small></small>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </div>
            <div className="editor">
              <div className="editor__bar">
                <span style={{ padding: '0 8px', fontSize: 13, fontWeight: 700 }}>
                  {chapter ? `Chapter ${chNo}: ${chapter.title}` : 'Text'}
                </span>
                <span className="grow"></span>
              </div>
              <div className="editor__page">
                {!work ? (
                  <div className="empty" style={{ padding: '48px 16px' }}>
                    <b>The text could not be loaded</b>
                    <span>Check your connection and reload. The flags on the left still work.</span>
                  </div>
                ) : (
                  chapter?.blocks.map((b, bi) => {
                    const pid = work.anchors.ids[ci]?.[bi];
                    const img = b.images?.find(m => m.alone);
                    if (img)
                      return (
                        <div key={pid ?? bi} id={pid} className="ct-img">
                          {`Image in chapter ${chNo} · ${mb(img.bytes)}${flaggedImages.has(img.path) ? ' · flagged' : ''}`}
                        </div>
                      );
                    if (b.sceneBreak)
                      return (
                        <p key={pid ?? bi} id={pid} className="scene">
                          * * *
                        </p>
                      );
                    const isHeading = /^<h[1-6]/i.test(b.html);
                    const text = pid && flagged.has(pid) ? <span className="flag">{b.text}</span> : b.text;
                    return isHeading ? (
                      <h3 key={pid ?? bi} id={pid}>
                        {text}
                      </h3>
                    ) : (
                      <p key={pid ?? bi} id={pid}>
                        {text}
                      </p>
                    );
                  })
                )}
              </div>
            </div>
            <div className="stack s16">
              <div className="panel">
                <div className="panel__head">
                  <h2>Readiness</h2>
                </div>
                <div className="panel__body">
                  <span className="ct-big">{score}%</span>
                  <div className="meter">
                    <i className={meterClass(score)} style={{ ['--v' as string]: `${score}%` }}></i>
                  </div>
                  <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
                    {blocking ? (
                      'A flag here blocks publishing. Fix it, or send the book back to the author.'
                    ) : open.length ? (
                      <>
                        {`Needs ${ready}% and no flags to reach review. Fixing all ${open.length} flag${open.length === 1 ? '' : 's'} takes it to `}
                        <b>100%</b>.
                      </>
                    ) : (
                      'No flags left. It can go to Quick review.'
                    )}
                  </span>
                  <div className="kv-row">
                    <span>Chapters</span>
                    <b>
                      {rev.chapters_confirmed_at
                        ? `${chapters?.length ?? 0}, confirmed ${day(rev.chapters_confirmed_at)}`
                        : `${chapters?.length ?? 0}`}
                    </b>
                  </div>
                  <div className="kv-row">
                    <span>Cover</span>
                    <b>{coverOk ? 'Passes' : 'Flagged'}</b>
                  </div>
                  <div className="kv-row">
                    <span>Words</span>
                    <b>{`${n0(rev.words ?? 0)} → ${n0(rev.pages ?? 0)} pages → ${n0(rev.price_credits ?? 0)} credits`}</b>
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel__head">
                  <h2>Author</h2>
                </div>
                <div className="panel__body">
                  <span style={{ fontSize: 13.5 }}>
                    {pdfHeavy
                      ? `This book came from a PDF and has ${open.length} flags. Asking ${first} for the Word file is usually quicker.`
                      : rev.chapters_confirmed_at
                        ? `${author} already confirmed the chapters on ${day(rev.chapters_confirmed_at)}, so staff only touch the flagged spots.`
                        : 'Staff only touch the flagged spots.'}
                  </span>
                  <DownloadOriginal
                    revisionId={id}
                    label={`Download original (.${rev.source_type ?? 'file'}${rev.file_bytes ? `, ${mb(rev.file_bytes)}` : ''})`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <Decide
          revisionId={id}
          position={queue.position}
          total={queue.total}
          canRelease={!blocking}
          blockedReason="Fix the flags that block publishing first, or send the book back."
          skipHref={queue.skipHref}
        />
      </section>
    </FixShell>
  );
}
