'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { returnChapter, type ReturnReason } from '../../../actions';

const REASONS: { code: ReturnReason; title: string; sub: string }[] = [
  { code: 'skipped_by_mistake', title: 'Skipped ahead by mistake', sub: 'Reader moved past the first page without meaning to' },
  { code: 'did_not_open', title: 'Chapter didn’t open or display', sub: 'Technical fault' },
  { code: 'wrong_book', title: 'Wrong book', sub: 'Reader meant to open another title' },
];

/**
 * Return a chapter charge (s-unlock-return, rule 30): the credits go back to the buckets they came
 * from, the chapter locks again and the author is not paid. A reason is required.
 */
export function ReturnModal({
  userId,
  chargeId,
  name,
  what,
  chargedAt,
  credits,
  windowEnd,
  windowOpen,
  returned,
  author,
}: {
  userId: string;
  chargeId: number;
  name: string;
  what: string;
  chargedAt: string;
  credits: number;
  windowEnd: string;
  windowOpen: boolean;
  returned: boolean;
  author: string;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<ReturnReason>('skipped_by_mistake');
  const closeHref = `/credits/${userId}`;
  const first = name.split(' ')[0]!;
  const blocked = returned || windowOpen;

  const submit = () =>
    start(async () => {
      const r = await returnChapter(userId, chargeId, reason);
      if (!r.ok) return show(r.error);
      router.push(`${closeHref}?done=${encodeURIComponent(r.message)}`);
    });

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal" role="dialog" aria-label="Return a chapter charge">
        <div className="modal__h">
          <div className="grow">
            <h2>{`Return ${credits.toLocaleString('en-NG')} credits to ${first}?`}</h2>
            <p>{`${what} · charged ${chargedAt}`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="kv-row">
            <span>Their own undo window</span>
            <b>{windowOpen ? `Open until ${windowEnd}` : `Ended ${windowEnd}`}</b>
          </div>
          {returned ? (
            <span className="muted">This charge was already returned. Nothing more to do.</span>
          ) : windowOpen ? (
            <span className="muted">{`${first} can still undo this in the app until ${windowEnd}. Try again after that.`}</span>
          ) : (
            <>
              <div className="f">
                <span className="lbl">Reason</span>
                <div className="radios" role="radiogroup" aria-label="Reason">
                  {REASONS.map(r => (
                    <div
                      key={r.code}
                      className={`radio${reason === r.code ? ' is-selected' : ''}`}
                      role="radio"
                      aria-checked={reason === r.code}
                      tabIndex={0}
                      onClick={() => setReason(r.code)}
                      onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setReason(r.code))}
                    >
                      <span>
                        <b>{r.title}</b>
                        <small>{r.sub}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <span className="muted">{`${what.split(', ').at(-1) ?? 'The chapter'} locks again and ${author} is not paid for it.`}</span>
            </>
          )}
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button className="btn btn-p" type="button" disabled={pending || blocked} onClick={submit}>
            {`Return ${credits.toLocaleString('en-NG')} credits`}
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
