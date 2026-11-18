'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { sendBack } from './actions';

interface Issue {
  text: string;
  on: boolean;
}

/**
 * Send back to author (s-book-changes from Fix flagged issues, s-book-sendback from Quick review):
 * the issue list (prefilled from the open flags, or empty), an optional note and what the author
 * will see in Studio. At least one issue or a note (rules 34, 36).
 */
export function SendBackModal({
  revisionId,
  title,
  author,
  ext,
  issues: initial,
  source,
  closeHref,
}: {
  revisionId: string;
  title: string;
  author: string;
  /** The source file's extension, for the default note. */
  ext: string;
  issues: string[];
  source: 'fixer' | 'quick_review';
  closeHref: string;
}) {
  const first = author.split(' ')[0] || 'the author';
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [issues, setIssues] = useState<Issue[]>(
    initial.length ? initial.map(text => ({ text, on: true })) : [{ text: '', on: true }],
  );
  const [note, setNote] = useState(
    initial.length
      ? `If you can, upload the ${ext === 'epub' ? 'EPUB' : 'Word'} file again after fixing these. It is the fastest route.`
      : '',
  );
  const chosen = issues.filter(i => i.on && i.text.trim()).map(i => i.text.trim());
  const ready = chosen.length > 0 || note.trim().length > 0;
  const set = (i: number, patch: Partial<Issue>) => setIssues(list => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal wide" role="dialog" aria-label="Send back to author">
        <div className="modal__h">
          <div className="grow">
            <h2>Send back to author</h2>
            <p>{`${title} · ${author}`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="stack s8">
            <b style={{ fontSize: 13 }}>What the author needs to fix</b>
            {!initial.length && (
              <span className="hint">No automatic flags on this book. Add what you found in the spot-check.</span>
            )}
            {issues.map((x, i) => (
              <div className="ct-issue" key={i}>
                <span
                  className={`cb${x.on ? ' on' : ''}`}
                  role="checkbox"
                  aria-checked={x.on}
                  aria-label={`Include issue ${i + 1}`}
                  tabIndex={0}
                  onClick={() => set(i, { on: !x.on })}
                  onKeyDown={e => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      set(i, { on: !x.on });
                    }
                  }}
                ></span>
                <div className="inp">
                  <input
                    value={x.text}
                    onChange={e => set(i, { text: e.target.value })}
                    aria-label={`Issue ${i + 1}`}
                    placeholder="What needs fixing"
                    maxLength={500}
                  />
                </div>
              </div>
            ))}
            {initial.length ? (
              <span className="hint">
                {`Filled from the ${initial.length} flag${initial.length === 1 ? '' : 's'} the system found. Edit the wording or untick what you fixed yourself.`}
              </span>
            ) : (
              <a
                className="link"
                style={{ fontSize: 13 }}
                role="button"
                tabIndex={0}
                onClick={() => setIssues(l => [...l, { text: '', on: true }])}
                onKeyDown={e => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setIssues(l => [...l, { text: '', on: true }]);
                  }
                }}
              >
                Add another issue
              </a>
            )}
          </div>
          <div className="f full">
            <label htmlFor="sb-note">
              Note to the author <span className="muted">(optional)</span>
            </label>
            <textarea
              id="sb-note"
              className="inp ta"
              rows={3}
              aria-label="Note to the author"
              value={note}
              maxLength={1000}
              onChange={e => setNote(e.target.value)}
            ></textarea>
          </div>
          {/* From Fix flagged issues only: Quick review's modal has no preview (s-book-sendback). */}
          {initial.length > 0 && (
          <div className="stack s8">
            <b style={{ fontSize: 13 }}>{`What ${first} sees in Studio`}</b>
            <div className="ct-seen">
              <b>
                {chosen.length
                  ? `${title} needs ${chosen.length} small fix${chosen.length === 1 ? '' : 'es'}`
                  : `${title} needs a change`}
              </b>
              {chosen.length > 0 && (
                <ul>
                  {chosen.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
              {note.trim() && <span className="muted">{note.trim()}</span>}
            </div>
          </div>
          )}
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button
            className="btn btn-p"
            type="button"
            disabled={pending}
            onClick={() => {
              if (!ready) return show('Add at least one issue or a note.');
              start(async () => {
                const r = await sendBack(
                  revisionId,
                  chosen.map(text => ({ text })),
                  note.trim(),
                  source,
                );
                if (!r.ok) return show(r.error!);
                router.push(`/books?sent=${revisionId}&n=${chosen.length}`);
              });
            }}
          >
            {`Send to ${first}`}
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
