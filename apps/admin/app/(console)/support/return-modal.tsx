'use client';

import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { watTime } from '../reports/labels';
import { returnChapterCharge, returnPreview, type ReturnPreview, type ReturnReason } from './actions';

const REASONS: { key: ReturnReason; title: string; sub: string }[] = [
  {
    key: 'skipped_ahead',
    title: 'Skipped ahead by mistake',
    sub: 'Reader moved past the first page without meaning to',
  },
  { key: 'did_not_open', title: 'Chapter didn’t open or display', sub: 'Technical fault' },
  { key: 'wrong_book', title: 'Wrong book', sub: 'Reader meant to open another title' },
];

const num = (n: number) => n.toLocaleString('en-NG');
const first = (name: string) => name.replace(/^@/, '').split(/\s+/)[0] ?? name;

function chargedAt(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' });
  if (day(d) === day(new Date())) return `today, ${watTime(iso)}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}, ${watTime(iso)}`;
}

/**
 * unlock-return (rule 39): give back a pay-as-you-read chapter charge after the reader's own
 * 10-minute undo has ended. Over 50 credits or a 4th return in 30 days waits for Finance.
 */
export function ReturnModal({
  ledgerId,
  initial = null,
  onClose,
  onDone,
}: {
  ledgerId: number;
  /** Loaded on the server when the page opens with `?return=`. */
  initial?: ReturnPreview | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [p, setP] = useState<ReturnPreview | null>(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<ReturnReason>('skipped_ahead');
  const [pending, start] = useTransition();

  useEffect(() => {
    if (initial) return;
    let live = true;
    void returnPreview(ledgerId).then((res) => {
      if (!live) return;
      if (res.error) setLoadError(res.error);
      else setP(res.data ?? null);
    });
    return () => {
      live = false;
    };
  }, [ledgerId, initial]);

  const name = p ? first(p.reader_name) : '';
  // Chapter titles from the pipeline read "Chapter 6"; otherwise count from ord (0-based).
  const chapter = !p?.chapter
    ? 'this chapter'
    : /^chapter \d+$/i.test(p.chapter.title ?? '')
      ? p.chapter.title!.toLowerCase()
      : `chapter ${p.chapter.ord + 1}`;
  const blocked = !p
    ? null
    : p.returned
      ? 'This charge was already returned or undone.'
      : p.undo_window_open
        ? 'The reader can still undo this themselves for a few more minutes.'
        : null;

  const submit = () =>
    start(async () => {
      if (!p) return;
      const res = await returnChapterCharge(p.ledger_id, reason);
      if (res.error) return setError(res.error);
      onDone(
        res.state === 'pending_approval'
          ? `Sent to Finance to approve. ${name} gets ${num(p.credits)} credits once it is approved.`
          : `${num(p.credits)} credits returned to ${name}. ${chapter[0]!.toUpperCase()}${chapter.slice(1)} is locked again.`,
      );
    });

  return (
    <section className="screen overlay enter">
      <a
        className="backdrop"
        href="#close"
        aria-label="Close"
        onClick={(e) => (e.preventDefault(), onClose())}
      />
      <div className="modal" role="dialog" aria-label="Return a chapter charge">
        <div className="modal__h">
          <div className="grow">
            <h2>{p ? `Return ${num(p.credits)} credits to ${name}?` : 'Return a chapter charge'}</h2>
            <p>
              {p
                ? `${p.book?.title ?? 'Book'}, ${chapter} · charged ${chargedAt(p.charged_at)}`
                : (loadError ?? 'Loading the charge…')}
            </p>
          </div>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {p ? (
          <div className="modal__b">
            {p.chapter ? (
              <div className="kv-row">
                <span>Chapter length</span>
                <b>{`${num(p.chapter.pages)} ${p.chapter.pages === 1 ? 'page' : 'pages'}`}</b>
              </div>
            ) : null}
            <div className="kv-row">
              <span>Their own undo window</span>
              <b>
                {`${p.undo_window_open ? 'Ends' : 'Ended'} ${watTime(new Date(new Date(p.charged_at).getTime() + 10 * 60_000).toISOString())}`}
              </b>
            </div>
            <div className="f">
              <span className="lbl">Reason</span>
              <div className="radios" role="radiogroup" aria-label="Reason">
                {REASONS.map((r) => (
                  <span
                    key={r.key}
                    className={`radio${reason === r.key ? ' is-selected' : ''}`}
                    role="radio"
                    aria-checked={reason === r.key}
                    tabIndex={0}
                    onClick={() => setReason(r.key)}
                    onKeyDown={(e) =>
                      (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setReason(r.key))
                    }
                  >
                    <span>
                      <b>{r.title}</b>
                      <small>{r.sub}</small>
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <span className="muted">
              {`${chapter[0]!.toUpperCase()}${chapter.slice(1)} locks again and ${p.book?.author_name ?? 'the author'} is not paid for it.`}
              {p.needs_approval ? ' This one needs a Finance approver before anything changes.' : ''}
            </span>
            {blocked || error ? <span className="hint err">{error ?? blocked}</span> : null}
          </div>
        ) : null}
        <div className="modal__f">
          <button type="button" className="btn btn-g" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-p" disabled={!p || !!blocked || pending} onClick={submit}>
            {p
              ? p.needs_approval
                ? `Ask Finance to return ${num(p.credits)}`
                : `Return ${num(p.credits)} credits`
              : 'Return credits'}
          </button>
        </div>
      </div>
    </section>
  );
}
