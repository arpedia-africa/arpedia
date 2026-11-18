import { Fragment } from 'react';
import { QueueToast } from '../queue-toast';
import { BooksHeader, FILE_TYPE, bookCounts, clock, coverClass, lagosDay, type Supa } from '../shared';
import { serverSupabase } from '@/lib/supabase/server';

/** The six steps written to `book_revisions.steps` (rule 49), with the wording for the one in progress. */
const STEPS = [
  { key: 'received', label: 'Received', doing: 'Receiving' },
  { key: 'converted', label: 'Converted', doing: 'Converting' },
  { key: 'chapters_found', label: 'Chapters found', doing: 'Finding chapters' },
  { key: 'checks', label: 'Checks', doing: 'Checks' },
  { key: 'author_confirms', label: 'Author confirms', doing: 'Waiting for the author' },
  { key: 'scored', label: 'Scored', doing: 'Scoring' },
] as const;

type Steps = Partial<Record<(typeof STEPS)[number]['key'], string>>;

/** Index of the first step not done yet (the current one, or the one that failed). */
const current = (steps: Steps) => {
  const i = STEPS.findIndex(s => !steps[s.key]);
  return i < 0 ? STEPS.length - 1 : i;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Until there is history, the prototype's promise: about 2 minutes, 3 for a PDF. */
const FALLBACK_MS: Record<string, number> = { docx: 120_000, epub: 120_000, pdf: 180_000 };

/**
 * Expected verify time for a file (rule 48): the median of the last 50 completed verifications of the
 * same file type, per byte when sizes are known, scaled by this file's size.
 */
async function estimator(supabase: Supa, types: string[]) {
  const history = new Map<string, { ms: number; perByte: number | null }>();
  await Promise.all(
    types.map(async type => {
      const { data } = await supabase
        .from('book_revisions')
        .select('steps, file_bytes')
        .eq('source_type', type as 'docx' | 'epub' | 'pdf')
        .not('steps->checks', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      const runs = (data ?? []).flatMap(r => {
        const s = r.steps as Steps;
        const ms = s.received && s.checks ? new Date(s.checks).getTime() - new Date(s.received).getTime() : NaN;
        return ms > 0 ? [{ ms, bytes: r.file_bytes }] : [];
      });
      if (!runs.length) return;
      const sized = runs.filter(r => r.bytes);
      history.set(type, {
        ms: median(runs.map(r => r.ms)),
        perByte: sized.length ? median(sized.map(r => r.ms / r.bytes!)) : null,
      });
    }),
  );
  return (type: string, bytes: number | null) => {
    const h = history.get(type);
    if (!h) return FALLBACK_MS[type] ?? 120_000;
    return h.perByte != null && bytes ? h.perByte * bytes : h.ms;
  };
}

function Track({ steps, failed }: { steps: Steps; failed?: boolean }) {
  const at = current(steps);
  return (
    <div className="ct-hs">
      {STEPS.map((s, i) => (
        <span key={s.key} className={i < at ? 'ok' : i === at ? (failed ? 'bad' : 'on') : ''}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Books · Processing (s-book-processing): what the system is converting, and what failed today. */
export default async function ProcessingPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  const { added } = await searchParams;
  const supabase = await serverSupabase();
  const book = `book:books!book_revisions_book_id_fkey(id, title, author:profiles!books_author_id_fkey(full_name))`;
  const [counts, jobs, failed] = await Promise.all([
    bookCounts(supabase),
    supabase
      .from('book_revisions')
      .select(`id, status, source_type, file_bytes, steps, created_at, ${book}`)
      .in('status', ['processing', 'with_desk'])
      .order('created_at', { ascending: true }),
    supabase
      .from('send_backs')
      .select(`id, note, sent_at, revision:book_revisions!send_backs_revision_id_fkey(id, source_type, steps, ${book})`)
      .eq('source', 'desk_auto')
      .gte('sent_at', new Date(Date.now() - 36 * 3_600_000).toISOString())
      .order('sent_at', { ascending: false }),
  ]);
  if (jobs.error) throw jobs.error;
  if (failed.error) throw failed.error;

  const now = Date.now();
  const today = lagosDay(now);
  const rows = jobs.data ?? [];
  const fails = (failed.data ?? []).filter(f => lagosDay(f.sent_at) === today && f.revision);
  // After Upload a book (s-book-new): the author is told a book was added to their account (rule 51).
  const addedRow = added ? rows.find(r => r.id === added) : undefined;
  const addedName = addedRow?.book?.author?.full_name?.split(' ')[0];
  const estimate = await estimator(supabase, [...new Set(rows.map(r => r.source_type).filter(t => t != null))]);

  return (
    <section className="screen enter">
      <BooksHeader tab="processing" counts={counts} />
      {added && (
        <QueueToast
          msg={`Upload started. ${addedName ?? 'The author'} gets a push and an email that a book was added to their account.`}
        />
      )}
      <div className="page">
        <div className="stack s20">
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Converting now</h2>
              <span className="sub">Usually 1 to 3 minutes</span>
            </div>
            {rows.length === 0 ? (
              <div className="empty" style={{ padding: '48px 24px' }}>
                <b>Nothing is being converted</b>
                <span>Books show here while the system checks them. Nobody needs to act.</span>
              </div>
            ) : (
              rows.map(r => {
                const steps = r.steps as Steps;
                const started = steps.received ?? r.created_at;
                const at = current(steps);
                const desk = r.status === 'with_desk';
                const left = Math.max(
                  1,
                  Math.round((estimate(r.source_type ?? '', r.file_bytes) - (now - new Date(started).getTime())) / 60_000),
                );
                // "waiting 20 h" as the prototype; under an hour in minutes, so a new upload doesn't read "1 h".
                const deskMin = Math.max(0, Math.floor((now - new Date(started).getTime()) / 60_000));
                const deskWait = deskMin < 1 ? 'just now' : deskMin < 60 ? `${deskMin} min` : `${Math.floor(deskMin / 60)} h`;
                return (
                  <div className="ct-job" key={r.id}>
                    <div className="who">
                      <span className={`cv ${coverClass(r.book?.id ?? r.id)} x40`}></span>
                      <span>
                        <b>{r.book?.title}</b>
                        <small>{`${r.book?.author?.full_name ?? ''} · ${FILE_TYPE[r.source_type ?? ''] ?? ''} · started ${clock(started)}`}</small>
                      </span>
                    </div>
                    <Track steps={steps} />
                    <span className="ct-job__t">
                      <b>{`Step ${at + 1} of ${STEPS.length}`}</b>
                      <br />
                      {desk ? `With the desk · waiting ${deskWait}` : `${STEPS[at]!.doing} · about ${left} min left`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          {fails.length > 0 && (
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Failed today</h2>
                <span className="sub">{`${fails.length} book${fails.length === 1 ? '' : 's'}`}</span>
              </div>
              {fails.map(f => {
                const r = f.revision!;
                const steps = r.steps as Steps;
                const author = r.book?.author?.full_name ?? '';
                return (
                  <Fragment key={f.id}>
                    <div className="ct-job">
                      <div className="who">
                        <span className={`cv ${coverClass(r.book?.id ?? r.id)} x40`}></span>
                        <span>
                          <b>{r.book?.title}</b>
                          <small>{`${author} · ${FILE_TYPE[r.source_type ?? ''] ?? ''} · ${clock(steps.received ?? f.sent_at)}`}</small>
                        </span>
                      </div>
                      <Track steps={steps} failed />
                      <span className="ct-job__t">
                        <b className="warn-t">File could not be opened</b>
                        <br />
                        {`Sent back at ${clock(f.sent_at)}`}
                      </span>
                    </div>
                    {f.note && (
                      <div style={{ padding: '0 18px 16px' }}>
                        <div className="quote">
                          <b style={{ fontFamily: 'var(--f-ui)', fontSize: 13 }}>
                            {`Message sent to ${author.split(' ')[0]} automatically`}
                          </b>
                          <br />
                          {`"${f.note}"`}
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
