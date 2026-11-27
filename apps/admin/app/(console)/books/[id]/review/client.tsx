'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { claimReview, publish } from './actions';

/** Opening Quick review claims the book; the header then shows who is on it. */
export function Claim({ revisionId, unassigned }: { revisionId: string; unassigned: boolean }) {
  const router = useRouter();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void claimReview(revisionId).then(r => {
      if (r.ok && r.mine && unassigned) router.refresh();
    });
  }, [revisionId, unassigned, router]);
  return null;
}

/** The decision bar: queue position, Reject (rule 39), Send back, Approve, Skip (J). */
export function ReviewDecide({
  revisionId,
  position,
  total,
  skipHref,
}: {
  revisionId: string;
  position: number;
  total: number;
  skipHref: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== 'j' || e.metaKey || e.ctrlKey || e.altKey || t.closest('input,textarea,select,[contenteditable]')) return;
      router.push(skipHref);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [router, skipHref]);
  return (
    <div className="decide">
      <div className="decide__q">
        Book{' '}
        <b>
          {position} of {total}
        </b>{' '}
        in Needs you ·{' '}
        <Link className="link" href="/books">
          Back to queue
        </Link>
      </div>
      <span className="grow"></span>
      <Link className="btn btn-g" href={`/books/${revisionId}/reject`}>
        Reject
      </Link>
      <Link className="btn btn-g" href={`/books/${revisionId}/sendback`}>
        Send back
      </Link>
      <Link className="btn btn-p" href={`/books/${revisionId}/approve`}>
        Approve
      </Link>
      <Link className="btn btn-q sm" href={skipHref}>
        Skip <span className="kbd">J</span>
      </Link>
    </div>
  );
}

/** Tomorrow at 08:00 Lagos time, as a datetime-local value (Lagos is UTC+1, no daylight saving). */
function tomorrowMorning() {
  const lagos = new Date(Date.now() + 3_600_000);
  lagos.setUTCDate(lagos.getUTCDate() + 1);
  return `${lagos.toISOString().slice(0, 10)}T08:00`;
}

/** "Fri 20 Nov 2026, 08:00 WAT" from a Lagos datetime-local value. */
function wat(local: string) {
  const at = new Date(`${local}:00+01:00`);
  if (Number.isNaN(at.getTime())) return '';
  const d = at.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });
  const t = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  return `${d}, ${t} WAT`;
}

/**
 * Approve and publish (s-book-approve, rule 37): one click publishes now; More options holds
 * Schedule, the price (read-only), Coming soon (automatic when scheduled) and the follower push.
 */
export function ApproveModal({
  revisionId,
  bookId,
  title,
  author,
  working,
  price,
  closeHref,
}: {
  revisionId: string;
  bookId: string;
  title: string;
  author: string;
  /** "71,480 words → 286 pages → 143 credits (₦429)" */
  working: string;
  price: string;
  closeHref: string;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [scheduled, setScheduled] = useState(false);
  const [at, setAt] = useState(tomorrowMorning);
  const [notify, setNotify] = useState(true);
  const when = wat(at);

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal" role="dialog" aria-label="Approve and publish">
        <div className="modal__h">
          <div className="grow">
            <h2>Approve and publish</h2>
            <p>{`${title} · ${working}`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <span>
            <b>{scheduled ? `Goes live on ${when}.` : 'Goes live in the app within a minute.'}</b>
            {notify ? ` ${author} and their followers get one push.` : ` ${author} gets a push.`} The book is added to
            New arrivals for 30 days.
          </span>
          <details className="fold">
            <summary>
              More options <small>schedule, price, Coming soon, notifications</small>
            </summary>
            <div className="fold__b">
              <div className="radios" role="radiogroup" aria-label="When">
                <div
                  className={`radio${scheduled ? '' : ' is-selected'}`}
                  role="radio"
                  aria-checked={!scheduled}
                  tabIndex={0}
                  onClick={() => setScheduled(false)}
                  onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setScheduled(false))}
                >
                  <span>
                    <b>Publish now</b>
                    <small>Live in the app within a minute</small>
                  </span>
                </div>
                <div
                  className={`radio${scheduled ? ' is-selected' : ''}`}
                  role="radio"
                  aria-checked={scheduled}
                  tabIndex={0}
                  onClick={() => setScheduled(true)}
                  onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setScheduled(true))}
                >
                  <span>
                    <b>Schedule</b>
                    <small>{when ? `Goes live on ${when}` : 'Pick a date and time'}</small>
                  </span>
                </div>
              </div>
              {scheduled && (
                <div className="inp">
                  <input
                    type="datetime-local"
                    value={at}
                    onChange={e => setAt(e.target.value)}
                    aria-label="Go-live date and time, Lagos time"
                  />
                </div>
              )}
              <div className="kv-row">
                <span>Price</span>
                <b>{`${price} · upfront or pay as you read`}</b>
              </div>
              <Link className="link" href={`/books/${bookId}/access`} style={{ fontSize: 13 }}>
                Override the price
              </Link>
              <div className="setrow">
                <span className="setrow__b">
                  <b>Show under Coming soon until launch</b>
                  <small>Only when scheduled; readers can tap Notify me</small>
                </span>
                <button className={`switch${scheduled ? ' on' : ''}`} role="switch" aria-checked={scheduled} disabled></button>
              </div>
              <div className="setrow">
                <span className="setrow__b">
                  <b>{`Notify followers of ${author}`}</b>
                  <small>Followers get one push on launch</small>
                </span>
                <button
                  className={`switch${notify ? ' on' : ''}`}
                  role="switch"
                  aria-checked={notify}
                  aria-label={`Notify followers of ${author}`}
                  onClick={() => setNotify(v => !v)}
                ></button>
              </div>
            </div>
          </details>
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
              const iso = scheduled ? new Date(`${at}:00+01:00`) : null;
              if (iso && (Number.isNaN(iso.getTime()) || iso.getTime() <= Date.now()))
                return show('Pick a time in the future, or publish now.');
              start(async () => {
                const r = await publish(revisionId, iso ? iso.toISOString() : null, notify);
                if (!r.ok) return show(r.error);
                router.push(
                  `/books?published=${revisionId}${r.status === 'scheduled' ? '&scheduled=1' : ''}${notify ? '' : '&quiet=1'}`,
                );
              });
            }}
          >
            {scheduled ? 'Approve and schedule' : 'Approve and publish'}
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
