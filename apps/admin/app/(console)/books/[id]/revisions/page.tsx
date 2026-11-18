import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icon';
import { serverSupabase } from '@/lib/supabase/server';
import { coverClass, date, dayMonth, queuePosition } from '../../shared';
import { loadWork } from '../../work';
import { ApproveUpdate, AuditCell, Changes, Revert } from './client';
import { passages, type Passage } from './diff';

const n0 = (n: number) => n.toLocaleString('en-NG');
const pct1 = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 1 });

/** Length band, as in the Explore filter (flow 02 rule 16): under 150 pages, 150 to 300, 300+. */
const band = (pages: number) => (pages < 150 ? 'Short' : pages < 300 ? 'Medium' : 'Long');

/** Statuses still on their way to readers: the revision this screen acts on. */
const ACTIVE = ['needs_fixes', 'ready_for_review', 'processing', 'with_desk', 'scheduled', 'sent_back'];

interface Diff {
  revision_id: string;
  inserted_words: number;
  deleted_words: number;
  changed_pct: number;
  chapters_added: number;
  chapters_removed: number;
  changed_chapter_uids: string[];
  added_chapter_uids: string[];
  cover_changed: boolean;
  metadata_changed: boolean;
  author_in_good_standing: boolean;
  fast_lane_eligible: boolean;
  reasons: string[];
}
type Chapter = { revision_id: string; chapter_uid: string; ord: number; kind: string; title: string };

/** "chapter 14", "chapters 3 to 9", "chapters 2, 5 and 9". */
function chapterList(nums: number[]) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  if (s.length === 1) return `chapter ${s[0]}`;
  if (s.length > 2 && s[s.length - 1]! - s[0]! === s.length - 1) return `chapters ${s[0]} to ${s[s.length - 1]}`;
  return `chapters ${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`;
}

/** Chapter numbers (numbered chapters only) and titles by uid, for a set of revisions' chapters. */
function chapterNames(chapters: Chapter[]) {
  const byRev = new Map<string, Chapter[]>();
  for (const c of chapters) byRev.set(c.revision_id, [...(byRev.get(c.revision_id) ?? []), c]);
  const no = new Map<string, Map<string, number>>();
  const title = new Map<string, string>();
  for (const [rev, list] of byRev) {
    const m = new Map<string, number>();
    list
      .filter(c => c.kind === 'chapter')
      .sort((a, b) => a.ord - b.ord)
      .forEach((c, i) => m.set(c.chapter_uid, i + 1));
    no.set(rev, m);
    for (const c of list) title.set(c.chapter_uid, c.title);
  }
  /** The chapter's number in the first of `revs` that has it. */
  const numberOf = (uid: string, revs: (string | null)[]) => {
    for (const r of revs) {
      const n = r ? no.get(r)?.get(uid) : undefined;
      if (n) return n;
    }
    return undefined;
  };
  return { numberOf, title: (uid: string) => title.get(uid) };
}

/** The Change column: what an update did, in plain words. */
function changeText(
  d: Diff | undefined,
  first: boolean,
  names: ReturnType<typeof chapterNames>,
  revs: (string | null)[],
) {
  if (!d) return first ? 'First publication' : '';
  const parts: string[] = [];
  const nums = d.changed_chapter_uids.map(u => names.numberOf(u, revs)).filter((n): n is number => !!n);
  if (nums.length) parts.push(`changed ${chapterList(nums)}`);
  else if (d.inserted_words + d.deleted_words > 0 && !d.chapters_added)
    parts.push(`${n0(d.inserted_words + d.deleted_words)} words changed`);
  if (d.chapters_added) {
    const titles = d.added_chapter_uids.map(u => names.title(u)).filter(Boolean);
    parts.push(
      d.chapters_added === 1 && titles.length === 1
        ? `new chapter “${titles[0]}”`
        : `${d.chapters_added} new chapter${d.chapters_added === 1 ? '' : 's'}`,
    );
  }
  if (d.chapters_removed) parts.push(`${d.chapters_removed} chapter${d.chapters_removed === 1 ? '' : 's'} removed`);
  if (d.cover_changed) parts.push('new cover');
  if (d.metadata_changed) parts.push('new details');
  const s = parts.join(', ') || 'No text changes';
  return s[0]!.toUpperCase() + s.slice(1);
}

function Status({ status, update }: { status: string; update: boolean }) {
  switch (status) {
    case 'ready_for_review':
      return <span className="st st-warn">{update ? 'Needs a person' : 'Ready for review'}</span>;
    case 'needs_fixes':
      return <span className="st st-warn">Needs fixes</span>;
    case 'processing':
      return <span className="st st-info">Processing</span>;
    case 'with_desk':
      return <span className="st st-info">With the desk</span>;
    case 'scheduled':
      return <span className="st st-info">Scheduled</span>;
    case 'taken_down':
      return <span className="st st-err">Taken down</span>;
    case 'live':
      return <span className="st-plain">Live</span>;
    default:
      return (
        <>
          {{ superseded: 'Replaced', sent_back: 'Sent back', unpublished: 'Unpublished', rejected: 'Rejected' }[
            status
          ] ?? 'Draft'}
        </>
      );
  }
}

/** "r4 needs a person", "r4 needs fixes", … for the header. */
const pendingWords: Record<string, string> = {
  ready_for_review: 'needs a person',
  needs_fixes: 'needs fixes',
  processing: 'is processing',
  with_desk: 'is with the desk',
  scheduled: 'is scheduled',
  sent_back: 'is sent back',
};

/** Why an update did or didn't take the fast lane (rule 43), as reasons a person reads. */
const REASON: Record<string, string> = {
  changed_pct: 'too many words changed',
  chapters_changed: 'the chapter change',
  cover_changed: 'the new cover',
  metadata_changed: 'the changed details',
  author_standing: "the author's standing",
  score: 'the readiness score',
  blocking_flag: 'a blocking flag',
  no_diff: 'a missing comparison',
};

/**
 * Revisions (s-book-revisions, rules 41–47): every revision of a book, why an update is or isn't in
 * the fast lane, the changed passages, recent fast-lane publishes with their spot audit, and the
 * paragraph links. `id` is a revision (from the queue) or a book (the book's Revisions tab).
 */
export default async function RevisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const { data: asRev } = await supabase.from('book_revisions').select('id, book_id').eq('id', id).maybeSingle();
  const bookId = asRev?.book_id ?? id;

  const [{ data: book }, { data: revs }, { data: config }, { data: recent }] = await Promise.all([
    supabase
      .from('books')
      .select('id, title, current_revision_id, author:profiles!books_author_id_fkey(full_name)')
      .eq('id', bookId)
      .maybeSingle(),
    supabase
      .from('book_revisions')
      .select(
        `id, revision_no, status, words, pages, fast_lane, base_revision_id, created_at, submitted_at, published_at,
         uploader:profiles!book_revisions_uploaded_by_fkey(full_name),
         publisher:profiles!book_revisions_published_by_fkey(full_name),
         audit:fast_lane_audits(status)`,
      )
      .eq('book_id', bookId)
      .order('revision_no', { ascending: false }),
    supabase.from('pipeline_config').select('value').eq('key', 'thresholds').maybeSingle(),
    supabase
      .from('book_revisions')
      .select(
        `id, revision_no, base_revision_id, published_at,
         book:books!book_revisions_book_id_fkey(title),
         audit:fast_lane_audits(status)`,
      )
      .eq('fast_lane', true)
      .in('status', ['live', 'superseded'])
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(6),
  ]);
  if (!book || !revs?.length) notFound();

  const all = revs;
  const live = all.find(r => r.id === book.current_revision_id) ?? all.find(r => r.status === 'live');
  const pending = all.find(r => ACTIVE.includes(r.status));
  const selected = all.find(r => r.id === asRev?.id) ?? pending ?? live ?? all[0]!;
  const base = selected.base_revision_id ? all.find(r => r.id === selected.base_revision_id) : undefined;

  const revIds = [...new Set([...all.map(r => r.id), ...(recent ?? []).flatMap(r => [r.id, r.base_revision_id ?? r.id])])];
  const [{ data: diffRows }, { data: chapterRows }, links, queue, work, baseWork] = await Promise.all([
    supabase.from('revision_diffs').select('*').in('revision_id', revIds),
    supabase.from('chapters').select('revision_id, chapter_uid, ord, kind, title').in('revision_id', revIds),
    selected.base_revision_id
      ? supabase.rpc('revision_links', { p_rev: selected.id })
      : Promise.resolve({ data: null }),
    queuePosition(supabase, selected.id),
    base ? loadWork(selected.id) : Promise.resolve(null),
    base ? loadWork(base.id) : Promise.resolve(null),
  ]);
  const diffs = new Map((diffRows ?? []).map(d => [d.revision_id, d as unknown as Diff]));
  const names = chapterNames((chapterRows ?? []) as Chapter[]);
  const limit = Number((config?.value as { fast_lane_changed_pct?: number } | null)?.fast_lane_changed_pct ?? 2);

  const title = book.title;
  const author = book.author?.full_name ?? '';
  const first = author.split(' ')[0] || 'the author';
  const d = diffs.get(selected.id);
  const isUpdate = !!selected.base_revision_id;
  const cur = `r${selected.revision_no}`;
  const liveNo = live ? `r${live.revision_no}` : null;

  const metaStatus = [
    liveNo ? `Live ${liveNo}` : 'Not live yet',
    pending ? `r${pending.revision_no} ${pendingWords[pending.status] ?? ''}`.trim() : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Changed passages, from the two working copies (null when they can't be loaded).
  const label = (uid: string, t: string) => {
    const no = names.numberOf(uid, [selected.id, base?.id ?? null]);
    return no ? `chapter ${no}` : `“${t}”`;
  };
  const changes: Passage[] | null = work && baseWork ? passages(baseWork, work, label) : null;
  const size = d
    ? [d.inserted_words ? `+${n0(d.inserted_words)}` : '', d.deleted_words ? `−${n0(d.deleted_words)}` : '']
        .filter(Boolean)
        .join(' ') + ' words'
    : '';

  // Why it is (or isn't) in the fast lane.
  const fast = selected.fast_lane || !!d?.fast_lane_eligible;
  const reasons = (d?.reasons ?? []).filter(r => r in REASON);
  const added = d?.chapters_added ?? 0;
  const linkData = links.data as {
    paragraphs: number;
    kept: number;
    highlights: number;
    highlights_kept: number;
    comments_moved: number;
  } | null;

  const decide = selected.status === 'ready_for_review' || selected.status === 'needs_fixes';
  const audit = (r: { audit: { status: string } | { status: string }[] | null }) => {
    const a = Array.isArray(r.audit) ? r.audit[0] : r.audit;
    return a?.status as 'pending' | 'ok' | 'problem' | undefined;
  };
  const problem = !!live?.fast_lane && audit(live) === 'problem';
  const revertTo = live?.base_revision_id ? all.find(r => r.id === live.base_revision_id) : undefined;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/books">Books</Link>
          <Icon name="chev" size="s" />
          <Link href={`/books/${bookId}`}>{title}</Link>
          <Icon name="chev" size="s" />
          <span>Revisions</span>
        </div>
        <div className="ph__row">
          <span className={`cv ${coverClass(bookId)} x56`}>
            <b>{title}</b>
          </span>
          <div className="ph__title">
            <h1>{title}</h1>
            <div className="ph__meta">
              <span>{author}</span>
              <span>{`${band(selected.pages ?? 0)} · ${n0(selected.words ?? 0)} words`}</span>
              <span>{metaStatus}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected="false" href={`/books/${bookId}`}>
          Details
        </Link>
        <Link role="tab" aria-selected="true" href={`/books/${bookId}/revisions`}>
          Revisions
        </Link>
        <Link role="tab" aria-selected="false" href={`/books/${bookId}/access`}>
          Pricing and access
        </Link>
        <Link role="tab" aria-selected="false" href={`/books/${bookId}/stats`}>
          Stats
        </Link>
      </div>
      <div className="page">
        <div className="panel panel--flush">
          <div className="panel__head">
            <h2>All revisions</h2>
          </div>
          <div className="tw">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Rev</th>
                  <th>Status</th>
                  <th>By</th>
                  <th>Date</th>
                  <th className="r">Words</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {all.map(r => (
                  <tr key={r.id} className={r.id === selected.id ? 'sel' : undefined}>
                    <td>
                      <b className="mono">{`r${r.revision_no}`}</b>
                    </td>
                    <td>
                      <Status status={r.status} update={!!r.base_revision_id} />
                    </td>
                    <td>{r.fast_lane ? 'Fast lane' : (r.publisher?.full_name ?? r.uploader?.full_name ?? '')}</td>
                    <td>{date(r.published_at ?? r.submitted_at ?? r.created_at)}</td>
                    <td className="n">{n0(r.words ?? 0)}</td>
                    <td>{changeText(diffs.get(r.id), !r.base_revision_id, names, [r.id, r.base_revision_id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="ct-two">
          <div className="stack s20">
            {!isUpdate ? (
              <div className="panel">
                <div className="empty">
                  <b>No updates yet</b>
                  <span>{`When ${first} sends a new version, it shows here with what changed.`}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="panel">
                  <div className="panel__head">
                    <h2>{fast ? `Why ${cur} took the fast lane` : `Why ${cur} is not in the fast lane`}</h2>
                  </div>
                  <div className="panel__body">
                    {d ? (
                      <>
                        <div className="kv-row">
                          <span>Words changed</span>
                          <b>{`${pct1(Number(d.changed_pct))}% (limit ${pct1(limit)}%)`}</b>
                        </div>
                        <div className="kv-row">
                          <span>Author in good standing</span>
                          <b>{d.author_in_good_standing ? 'Yes' : 'No'}</b>
                        </div>
                        <div className="kv-row">
                          <span>New chapters</span>
                          <b>{added ? `${added} new (fast lane allows none)` : 'None'}</b>
                        </div>
                        {d.chapters_removed > 0 && (
                          <div className="kv-row">
                            <span>Chapters removed</span>
                            <b>{`${d.chapters_removed} (fast lane allows none)`}</b>
                          </div>
                        )}
                        {d.cover_changed && (
                          <div className="kv-row">
                            <span>Cover</span>
                            <b>New cover (a person checks it)</b>
                          </div>
                        )}
                        {d.metadata_changed && (
                          <div className="kv-row">
                            <span>Book details</span>
                            <b>Changed (a person checks them)</b>
                          </div>
                        )}
                        <span>
                          {fast
                            ? `Every check passed, so ${cur} went live without waiting for a person. Some fast-lane updates are spot-audited each week.`
                            : selected.status === 'ready_for_review' || selected.status === 'needs_fixes'
                              ? `Because of ${reasons.map(r => REASON[r]).join(' and ') || 'the checks'}, a person checks ${cur}.${liveNo ? ` Readers stay on ${liveNo} until then.` : ''}`
                              : `Because of ${reasons.map(r => REASON[r]).join(' and ') || 'the checks'}, a person checked ${cur}.`}
                        </span>
                      </>
                    ) : (
                      <span className="muted">The comparison with the previous revision isn’t ready yet.</span>
                    )}
                  </div>
                </div>
                {changes === null ? (
                  <div className="panel">
                    <div className="panel__head">
                      <h2>What changed</h2>
                    </div>
                    <div className="empty">
                      <b>The changes could not be loaded</b>
                      <span>Check your connection and reload. The summary above still applies.</span>
                    </div>
                  </div>
                ) : changes.length ? (
                  <Changes passages={changes} size={size} />
                ) : (
                  <div className="panel">
                    <div className="panel__head">
                      <h2>What changed</h2>
                    </div>
                    <div className="empty">
                      <b>No text changes</b>
                      <span>Only the cover or the book details changed.</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Recent fast-lane updates</h2>
                <span className="sub">{`Under ${pct1(limit)}% changed, no new chapters`}</span>
              </div>
              {(recent ?? []).length ? (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Book</th>
                        <th>Rev</th>
                        <th className="r">Changed</th>
                        <th>What</th>
                        <th>Auto-published</th>
                        <th>Spot audit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recent ?? []).map(r => {
                        const rd = diffs.get(r.id);
                        const a = audit(r);
                        return (
                          <tr key={r.id}>
                            <td>
                              <b>{r.book?.title ?? ''}</b>
                            </td>
                            <td className="mono">{`r${r.revision_no}`}</td>
                            <td className="n">{rd ? `${pct1(Number(rd.changed_pct))}%` : ''}</td>
                            <td>{changeText(rd, false, names, [r.id, r.base_revision_id])}</td>
                            <td>{r.published_at ? dayMonth(r.published_at) : ''}</td>
                            <td>
                              {a === 'pending' ? (
                                <AuditCell revisionId={r.id} title={r.book?.title ?? ''} revisionNo={r.revision_no} />
                              ) : a === 'ok' ? (
                                'Checked'
                              ) : a === 'problem' ? (
                                'Problem found'
                              ) : (
                                'Not picked'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <b>No fast-lane updates yet</b>
                  <span>Small fixes that publish themselves show here for spot audits.</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {linkData && (
          <details className="fold">
            <summary>
              Highlights and discussions{' '}
              <small>{`paragraph links kept for ${n0(linkData.kept)} of ${n0(linkData.paragraphs)}`}</small>
            </summary>
            <div className="fold__b">
              <div className="kv-row">
                <span>Discussions moved to the nearest paragraph</span>
                <b>{n0(linkData.comments_moved)}</b>
              </div>
              <div className="kv-row">
                <span>Highlights kept</span>
                <b>{`${n0(linkData.highlights_kept)} of ${n0(linkData.highlights)}`}</b>
              </div>
            </div>
          </details>
        )}
      </div>
      {decide ? (
        <div className="decide">
          <div className="decide__q">
            Book{' '}
            <b>
              {queue.position} of {queue.total}
            </b>{' '}
            in Needs you ·{' '}
            <Link className="link" href="/books">
              Back to queue
            </Link>
          </div>
          <span className="grow"></span>
          <Link className="btn btn-g" href={`/books/${selected.id}/revisions/sendback`}>
            Send back
          </Link>
          {selected.status === 'ready_for_review' ? (
            <ApproveUpdate revisionId={selected.id} revisionNo={selected.revision_no} />
          ) : (
            <Link className="btn btn-p" href={`/books/${selected.id}/fix`}>
              Fix flagged issues
            </Link>
          )}
          <Link className="btn btn-q sm" href={queue.skipHref}>
            Skip <span className="kbd">J</span>
          </Link>
        </div>
      ) : (
        problem &&
        revertTo && (
          <div className="decide">
            <div className="decide__q">{`A spot audit found a problem with ${liveNo}.`}</div>
            <span className="grow"></span>
            <Revert revisionId={revertTo.id} revisionNo={revertTo.revision_no} title={title} />
          </div>
        )
      )}
    </section>
  );
}
