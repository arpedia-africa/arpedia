'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { coverClass } from '../../books/shared';
import { watTime } from '../../reports/labels';
import { askAuthor, decideClaim } from '../actions';
import {
  dayMonth,
  markRuns,
  receivedAt,
  STATUS_LABEL,
  STATUS_PILL,
  TYPE_LABEL,
  type ClaimStatus,
  type ClaimType,
} from '../labels';

interface Passage {
  source: string;
  book: string;
}
interface Evidence {
  name: string;
  kind?: string;
  size?: string;
  note?: string;
  url?: string;
}

export interface ClaimDetail {
  claim: {
    id: string;
    ref: string;
    book_id: string;
    claimant_name: string;
    claimant_contact: string | null;
    type: ClaimType;
    details: string | null;
    evidence: Evidence[];
    similarity: {
      score?: number;
      flagged?: number;
      chapter?: string;
      source_title?: string;
      source_label?: string;
      passages?: Passage[];
      checked?: number;
      failed?: boolean;
    } | null;
    author_response: string | null;
    status: ClaimStatus;
    author_due_at: string | null;
    due_at: string;
    decision_note: string | null;
    decided_at: string | null;
    created_at: string;
  };
  book: {
    id: string;
    title: string;
    status: string;
    author_id: string;
    author_name: string;
    held: boolean;
    readers: number;
  };
  can_decide: boolean;
  past_claims: number;
  timeline: { at: string; action: string; by: string | null; summary: string | null }[];
}

const num = (n: number) => n.toLocaleString('en-NG');
const first = (name: string) => name.split(/\s+/)[0] ?? name;
const BOOK_STATUS: Record<string, string> = {
  draft: 'In review',
  live: 'Live',
  unpublished: 'Unpublished',
  taken_down: 'Taken down (copyright)',
};

function Passages({ text }: { text: string }) {
  return (
    <div className="quote">
      {markRuns(text).map((r, i) => (r.mark ? <mark key={i}>{r.text}</mark> : <span key={i}>{r.text}</span>))}
    </div>
  );
}

/** s-claim. J skips to the next open claim. */
export function ClaimView({
  detail,
  failed,
  position,
  total,
  next,
}: {
  detail: ClaimDetail | null;
  failed: boolean;
  position: number | null;
  total: number;
  next: { id: string; ref: string; waiting: boolean } | null;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<'reject' | 'uphold' | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'j' || e.key === 'J') && !(e.target as Element).closest('input, textarea') && next)
        router.push(`/claims/${next.id}`);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [next, router]);

  if (failed || !detail) {
    return (
      <section className="screen enter">
        <div className="page">
          <div className="panel">
            <div className="empty">
              <b>This claim didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
              <div className="row">
                <a className="btn btn-g" href="/claims">
                  Back to claims
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const { claim: c, book } = detail;
  const open = c.status === 'new' || c.status === 'waiting_on_author';
  const pill = STATUS_PILL[c.status];
  const sim = c.similarity;
  const author = first(book.author_name);
  const after = (msg: string) => {
    showToast(msg);
    router.push(next ? `/claims/${next.id}` : '/claims');
  };

  const ask = () =>
    start(async () => {
      const res = await askAuthor(c.id);
      if (res.error) return showToast(res.error);
      const due = dayMonth(new Date(Date.now() + 7 * 86_400_000));
      after(
        c.status === 'waiting_on_author'
          ? `Reminder sent. ${author} now has until ${due} to reply.`
          : `${author} has until ${due} to reply. ${c.claimant_name} is told it is being looked into.`,
      );
    });

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <a href="/claims">Copyright claims</a>
          <Icon name="chev" />
          <span>{c.ref}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>
              {`${book.title} `}
              {pill ? (
                <span className={pill}>{STATUS_LABEL[c.status]}</span>
              ) : (
                <span className="st">{STATUS_LABEL[c.status]}</span>
              )}
            </h1>
            <div className="ph__meta">
              <span>{`${TYPE_LABEL[c.type]} · ${c.claimant_name}`}</span>
              <span>{`Received ${receivedAt(c.created_at)}`}</span>
              <span>
                {open
                  ? `Due ${dayMonth(c.due_at)}`
                  : c.decided_at
                    ? `Decided ${dayMonth(c.decided_at)}`
                    : 'Decided'}
              </span>
            </div>
          </div>
          <div className="ph__acts">
            <div className="mwrap">
              <button
                type="button"
                className="ib"
                aria-expanded={menu}
                aria-label="More actions"
                onClick={() => setMenu((m) => !m)}
              >
                <Icon name="more" />
              </button>
              {menu ? (
                <div className="menu">
                  <a href={`/books/${book.id}/revisions`}>Open the book</a>
                  <a href={`/authors/${book.author_id}`}>{`Open ${book.author_name}`}</a>
                  <a href="/policies">Copyright policy</a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Matching passages</h2>
                {sim?.chapter && sim.source_title ? (
                  <span className="sub">{`${sim.chapter} against ${sim.source_title}`}</span>
                ) : null}
              </div>
              <div className="panel__body">
                {sim?.passages?.length ? (
                  <>
                    {sim.score != null ? (
                      <div className="row">
                        <span className="ts-sim">{`${sim.score}%`}</span>
                        <span className="muted">
                          {`of the ${num(sim.flagged ?? sim.passages.length)} flagged passages match${sim.source_title ? ' the source text' : ''}, word for word or with small changes.`}
                        </span>
                      </div>
                    ) : null}
                    {sim.passages.map((p, i) => (
                      <div className="ts-cols2" key={i}>
                        <div className="stack s8">
                          {i === 0 && sim.source_label ? <b>{sim.source_label}</b> : null}
                          <Passages text={p.source} />
                        </div>
                        <div className="stack s8">
                          {i === 0 ? (
                            <b>{`${book.title}${sim.chapter ? `, ${sim.chapter.toLowerCase()}` : ''}`}</b>
                          ) : null}
                          <Passages text={p.book} />
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <span className="muted">
                    {sim?.checked
                      ? `${sim.checked === 1 ? 'The passage in the claim was not found' : `None of the ${num(sim.checked)} passages in the claim was found`} in the book. Read the claimant's evidence and the author's response in More details.`
                      : "No passage check for this claim. Read the claimant's evidence and the author's response in More details."}
                  </span>
                )}
              </div>
            </div>
            <details className="fold">
              <summary>
                More details <small>evidence, author&apos;s response, timeline</small>
              </summary>
              <div className="fold__b">
                <b>Evidence from the claimant</b>
                {c.evidence.length ? (
                  c.evidence.map((f, i) => (
                    <div className="file" key={i}>
                      <span className="grow">
                        <b>{f.name}</b>
                        {f.kind || f.size || f.note ? (
                          <small>{[f.kind, f.size, f.note].filter(Boolean).join(' · ')}</small>
                        ) : null}
                      </span>
                      {f.url ? (
                        <a className="btn btn-g sm" href={f.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="muted">No files sent.</p>
                )}
                {c.details ? (
                  <p className="muted">{`"${c.details}"${c.claimant_contact ? ` Contact: ${c.claimant_contact}` : ''}`}</p>
                ) : null}
                <b>
                  Author&apos;s response
                  {c.author_response ? null : c.status === 'waiting_on_author' && c.author_due_at ? (
                    <>
                      {' · '}
                      <span className="st st-warn">{`Requested, due ${dayMonth(c.author_due_at)}`}</span>
                    </>
                  ) : null}
                </b>
                {c.author_response ? (
                  <div className="ts-review">{`"${c.author_response}"`}</div>
                ) : (
                  <p className="muted">
                    {c.status === 'waiting_on_author'
                      ? `${book.author_name} got a push and an email with the claim text (claimant contact details withheld)${c.author_due_at ? ` and has until ${dayMonth(c.author_due_at)}` : ''}. Use Ask author to send a reminder or extend.`
                      : open
                        ? `Not asked yet. Use Ask author to give ${author} 7 days to answer.`
                        : 'No response was sent.'}
                  </p>
                )}
                {!open && c.decision_note ? (
                  <>
                    <b>Decision note</b>
                    <p className="muted">{c.decision_note}</p>
                  </>
                ) : null}
                <b>Timeline</b>
                <div className="tl">
                  <div className="tl__i org">
                    <b>Claim received</b>
                    <small>{receivedAt(c.created_at)}</small>
                  </div>
                  {detail.timeline.map((t, i) => (
                    <div className="tl__i" key={i}>
                      <b>{t.summary ?? t.action}</b>
                      <small>{`${dayMonth(t.at)}, ${watTime(t.at)}${t.by ? ` · ${t.by}` : ''}`}</small>
                    </div>
                  ))}
                  {open ? (
                    <div className="tl__i">
                      <b>Decision due</b>
                      <small>{dayMonth(c.due_at)}</small>
                    </div>
                  ) : null}
                </div>
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Claimant and book</h2>
              </div>
              <div className="panel__body">
                <dl className="kv tight">
                  <dt>Claimant</dt>
                  <dd>{c.claimant_name}</dd>
                  <dt>Contact</dt>
                  <dd>{c.claimant_contact ?? 'Not given'}</dd>
                  <dt>Past claims</dt>
                  <dd>{`${num(detail.past_claims)} with Arpedia`}</dd>
                </dl>
                <div className="who">
                  <span className={`cv ${coverClass(book.id)} x40`}></span>
                  <span>
                    <b>{book.title}</b>
                    <small>{`${book.author_name} · ${BOOK_STATUS[book.status] ?? book.status}${book.held && book.status !== 'taken_down' ? ' · Held' : ''}`}</small>
                  </span>
                </div>
                <dl className="kv tight">
                  <dt>Author</dt>
                  <dd>
                    <a className="link" href={`/authors/${book.author_id}`}>
                      {book.author_name}
                    </a>
                  </dd>
                  <dt>Readers so far</dt>
                  <dd>{book.status === 'live' || book.readers ? num(book.readers) : '0 (not yet live)'}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="decide">
        <div className="decide__q">
          {position ? (
            <>
              Claim <b>{`${position} of ${total}`}</b> ·{' '}
            </>
          ) : null}
          <a className="link" href="/claims">
            Back to claims
          </a>
        </div>
        <span className="grow" />
        {open ? (
          <>
            <button
              type="button"
              className="btn btn-g"
              disabled={pending || !detail.can_decide}
              onClick={() => setModal('reject')}
            >
              Reject claim
            </button>
            <button type="button" className="btn btn-g" disabled={pending} onClick={ask}>
              Ask author
            </button>
            <button
              type="button"
              className="btn btn-d"
              disabled={pending || !detail.can_decide}
              onClick={() => setModal('uphold')}
            >
              Uphold and take down
            </button>
          </>
        ) : (
          <span className="muted">{STATUS_LABEL[c.status]}</span>
        )}
        {next ? (
          <a
            className="btn btn-q sm"
            href={`/claims/${next.id}`}
            onClick={() =>
              showToast(`Skipped. ${next.ref}${next.waiting ? ' is waiting on the author' : ' is next'}.`)
            }
          >
            Skip <span className="kbd">J</span>
          </a>
        ) : null}
      </div>
      {modal === 'reject' ? (
        <NoteModal
          title="Reject this claim?"
          sub={`${book.title} stays as it is${book.held ? ' and leaves the hold' : ''}. ${c.claimant_name} and ${book.author_name} are told.`}
          label="Reason, sent to both"
          initial="We looked at the evidence and the book, and did not find enough to take it down."
          confirm="Reject claim"
          onClose={() => setModal(null)}
          onConfirm={(note) => decideClaim(c.id, 'reject', note)}
          onDone={() => after(`Claim rejected. ${c.claimant_name} and ${book.author_name} told.`)}
        />
      ) : null}
      {modal === 'uphold' ? (
        <NoteModal
          danger
          title={`Take down ${book.title}?`}
          sub={`It moves to Taken down (copyright). New unlocks stop; ${
            book.readers
              ? `the ${num(book.readers)} reader${book.readers === 1 ? '' : 's'} who unlocked it keep access`
              : 'nobody has unlocked it yet'
          }. Author earnings for it stay held back.`}
          label="Reason, sent to the author and the claimant"
          initial={`We upheld a ${TYPE_LABEL[c.type].toLowerCase()} claim against ${book.title}, so it is taken down.`}
          confirm="Uphold and take down"
          typeToConfirm={book.title}
          onClose={() => setModal(null)}
          onConfirm={(note) => decideClaim(c.id, 'uphold', note)}
          onDone={() =>
            after(`${book.title} is taken down. ${book.author_name} and ${c.claimant_name} told.`)
          }
        />
      ) : null}
      {toastNode}
    </section>
  );
}

/** Reject (plain) and Uphold (danger, title typed to confirm, as s-book-unpublish) both need a reason. */
function NoteModal({
  danger,
  title,
  sub,
  label,
  initial,
  confirm,
  typeToConfirm,
  onClose,
  onConfirm,
  onDone,
}: {
  danger?: boolean;
  title: string;
  sub: string;
  label: string;
  initial: string;
  confirm: string;
  typeToConfirm?: string;
  onClose: () => void;
  onConfirm: (note: string) => Promise<{ ok?: boolean; error?: string }>;
  onDone: () => void;
}) {
  const [note, setNote] = useState(initial);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.trim().toLowerCase();
  const submit = () =>
    start(async () => {
      const res = await onConfirm(note.trim());
      if (res.error) setError(res.error);
      else onDone();
    });

  return (
    <div className="screen overlay">
      <a
        className="backdrop"
        href="#close"
        aria-label="Close"
        onClick={(e) => (e.preventDefault(), onClose())}
      />
      <div className={`modal${danger ? ' danger' : ''}`} role="dialog" aria-label={title}>
        <div className="modal__h">
          <div className="grow">
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__b">
          <div className="f">
            <label htmlFor="cl-note">{label}</label>
            <textarea
              id="cl-note"
              className="inp ta"
              rows={4}
              maxLength={2000}
              value={note}
              onChange={(e) => (setNote(e.target.value), setError(null))}
            />
          </div>
          {typeToConfirm ? (
            <div className="f">
              <label htmlFor="cl-title">Type the book title to confirm</label>
              <div className="inp">
                <input
                  id="cl-title"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  aria-label="Confirm title"
                />
              </div>
              {typed ? <span className="hint">{matches ? 'Matches' : 'Doesn’t match yet'}</span> : null}
            </div>
          ) : null}
          {error ? <span className="hint err">{error}</span> : null}
        </div>
        <div className="modal__f">
          <button type="button" className="btn btn-g" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-d' : 'btn-p'}`}
            disabled={pending || !note.trim() || !matches}
            onClick={submit}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
