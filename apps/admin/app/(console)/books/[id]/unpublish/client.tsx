'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { unpublish } from '../../actions';

type Reason = 'author_request' | 'policy_violation' | 'quality';

function Radio({
  on,
  disabled,
  onPick,
  title,
  sub,
}: {
  on: boolean;
  disabled?: boolean;
  onPick: () => void;
  title: string;
  sub?: string;
}) {
  return (
    <div
      className={`radio${on ? ' is-selected' : ''}`}
      role="radio"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      tabIndex={0}
      onClick={onPick}
      onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onPick())}
    >
      <span>
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

/**
 * Unpublish book (s-book-unpublish, rule 52): a reason, what happens to readers who unlocked it
 * (Keep access by default; Remove access is for policy violations, by a Super admin), whether to
 * tell them, and the title typed to confirm.
 */
export function UnpublishModal({
  bookId,
  title,
  readers,
  credits,
  superAdmin,
  closeHref,
}: {
  bookId: string;
  title: string;
  readers: number;
  credits: number;
  superAdmin: boolean;
  closeHref: string;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<Reason>('author_request');
  const [remove, setRemove] = useState(false);
  const [notify, setNotify] = useState(true);
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === title.trim().toLowerCase();
  const canRemove = superAdmin && reason === 'policy_violation';
  const n = readers.toLocaleString('en-NG');

  const pickReason = (r: Reason) => {
    setReason(r);
    if (r !== 'policy_violation') setRemove(false);
  };

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal danger" role="dialog" aria-label={`Unpublish ${title}?`}>
        <div className="modal__h">
          <div className="grow">
            <h2>{`Unpublish ${title}?`}</h2>
            <p>
              {`It leaves search, shelves and Trending. ${readers ? `${n} reader${readers === 1 ? ' has' : 's have'} unlocked it.` : 'Nobody has unlocked it yet.'}`}
            </p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="stack s8">
            <b style={{ fontSize: 13 }}>Reason</b>
            <div className="radios" role="radiogroup" aria-label="Reason">
              <Radio on={reason === 'author_request'} onPick={() => pickReason('author_request')} title="Author request" />
              <Radio
                on={reason === 'policy_violation'}
                onPick={() => pickReason('policy_violation')}
                title="Policy violation"
              />
              <Radio on={reason === 'quality'} onPick={() => pickReason('quality')} title="Quality" />
            </div>
          </div>
          <div className="stack s8">
            <b style={{ fontSize: 13 }}>Readers who already unlocked it</b>
            <div className="radios" role="radiogroup" aria-label="Readers who already unlocked it">
              <Radio
                on={!remove}
                onPick={() => setRemove(false)}
                title="Keep access"
                sub="They finish reading; new readers cannot find it"
              />
              <Radio
                on={remove}
                disabled={!canRemove}
                onPick={() =>
                  canRemove
                    ? setRemove(true)
                    : show(
                        superAdmin
                          ? 'Remove access is for policy violations only.'
                          : 'Only a Super admin can remove access.',
                      )
                }
                title="Remove access"
                sub={`Credits go back to their balance (${credits.toLocaleString('en-NG')} credits in total)`}
              />
            </div>
          </div>
          <div className="setrow">
            <span className="setrow__b">
              <b>Notify readers</b>
              <small>{`Push to the ${n} who unlocked, with a short explanation`}</small>
            </span>
            <button
              className={`switch${notify ? ' on' : ''}`}
              role="switch"
              aria-checked={notify}
              aria-label="Notify readers"
              onClick={() => setNotify(v => !v)}
            ></button>
          </div>
          <div className="f">
            <label htmlFor="unpublish-title">Type the book title to confirm</label>
            <div className="inp">
              <input
                id="unpublish-title"
                value={typed}
                autoComplete="off"
                aria-label="Confirm title"
                onChange={e => setTyped(e.target.value)}
              />
            </div>
            <span className="hint">{matches ? 'Matches' : typed ? 'Does not match yet' : `Type “${title}”`}</span>
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button
            className="btn btn-d"
            type="button"
            disabled={pending || !matches}
            onClick={() =>
              start(async () => {
                const r = await unpublish(bookId, reason, remove, notify, typed);
                if (!r.ok) return show(r.error!);
                router.push(`/books?unpublished=${bookId}${notify && readers ? `&told=${readers}` : ''}`);
              })
            }
          >
            Unpublish
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
