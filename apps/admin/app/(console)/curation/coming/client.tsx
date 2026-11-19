'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { saveComingSoon } from '../actions';

export interface Candidate {
  bookId: string;
  title: string;
  author: string;
  releaseAt: string | null;
  teaser: string;
  notify: number;
  onShelf: boolean;
  cover: string;
}

const TEASER_MAX = 140;
const TZ = 'Africa/Lagos';
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
/** WAT parts for the date and time inputs (WAT is UTC+1 all year). */
const watParts = (iso: string | null) => {
  if (!iso) return { date: '', time: '08:00' };
  const wat = new Date(new Date(iso).getTime() + 3600_000).toISOString();
  return { date: wat.slice(0, 10), time: wat.slice(11, 16) };
};
const fromWat = (date: string, time: string) => (date ? new Date(`${date}T${time || '08:00'}:00+01:00`).toISOString() : null);

/** Edit Coming soon entry (s-curation-coming): book, teaser, release date and time, Notify me count. */
export function ComingDrawer({ candidates, initial }: { candidates: Candidate[]; initial: string | null }) {
  const router = useRouter();
  const [bookId, setBookId] = useState(initial);
  const [choosing, setChoosing] = useState(false);
  const c = candidates.find(x => x.bookId === bookId) ?? null;
  const [teaser, setTeaser] = useState(c?.teaser ?? '');
  const [{ date, time }, setWhen] = useState(watParts(c?.releaseAt ?? null));
  const [busy, start] = useTransition();
  const [toastNode, showToast] = useToast();

  const choose = (id: string) => {
    const next = candidates.find(x => x.bookId === id)!;
    setBookId(id);
    setTeaser(next.teaser);
    setWhen(watParts(next.releaseAt));
    setChoosing(false);
  };
  const save = () => {
    if (!c) return;
    const releaseAt = fromWat(date, time);
    start(async () => {
      const r = await saveComingSoon(c.bookId, teaser.trim(), releaseAt);
      if (!r.ok) return showToast(r.error ?? "Couldn't save the entry.");
      const when = releaseAt ? ` on ${dayLabel(releaseAt)}` : ' when it goes live';
      const msg =
          c.notify
            ? `Coming soon entry saved. The ${c.notify.toLocaleString('en-NG')} readers who tapped Notify me still get one push${when}.`
            : 'Coming soon entry saved.';
      router.push(`/curation?notice=${encodeURIComponent(msg)}`);
    });
  };

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href="/curation" aria-label="Close"></Link>
      <div className="drawer" role="dialog" aria-label="Coming soon entry">
        <div className="modal__h">
          <div className="grow">
            <h2>Edit Coming soon entry</h2>
            <p>Shown under Coming soon on the app home</p>
          </div>
          <Link className="ib" href="/curation" aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          {!c ? (
            <div className="empty" style={{ padding: '40px 12px' }}>
              <b>No scheduled books</b>
              <span>A book shows under Coming soon once it is approved with a release date.</span>
            </div>
          ) : (
            <>
              <div className="f">
                <label>Book</label>
                <div className="file">
                  <span className={`cv ${c.cover} x32`} />
                  <div className="grow">
                    <b>{c.title}</b>
                    <small>
                      {c.author}
                      {c.releaseAt ? ` · scheduled ${dayLabel(c.releaseAt)}` : ''}
                    </small>
                  </div>
                  {candidates.length > 1 ? (
                    <a
                      className="link"
                      style={{ fontSize: 13 }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setChoosing(v => !v)}
                      onKeyDown={e => e.key === 'Enter' && setChoosing(v => !v)}
                    >
                      Change
                    </a>
                  ) : null}
                </div>
                {choosing ? (
                  <div className="menu" style={{ position: 'static' }}>
                    {candidates.map(x => (
                      <a
                        key={x.bookId}
                        role="button"
                        tabIndex={0}
                        onClick={() => choose(x.bookId)}
                        onKeyDown={e => e.key === 'Enter' && choose(x.bookId)}
                      >
                        {x.title} <span className="muted">· {x.author}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="f full">
                <label htmlFor="teaser">Teaser text</label>
                <textarea
                  id="teaser"
                  className="inp ta"
                  rows={3}
                  maxLength={TEASER_MAX}
                  value={teaser}
                  onChange={e => setTeaser(e.target.value)}
                />
                <span className="hint">
                  {teaser.length ? `${teaser.length} of ${TEASER_MAX} characters` : `Up to ${TEASER_MAX} characters`}
                </span>
              </div>
              <div className="fgrid">
                <div className="f">
                  <label htmlFor="rel-date">Release date</label>
                  <input
                    id="rel-date"
                    className="inp"
                    type="date"
                    value={date}
                    onChange={e => setWhen(w => ({ ...w, date: e.target.value }))}
                  />
                </div>
                <div className="f">
                  <label htmlFor="rel-time">Time (WAT)</label>
                  <input
                    id="rel-time"
                    className="inp"
                    type="time"
                    value={time}
                    onChange={e => setWhen(w => ({ ...w, time: e.target.value }))}
                  />
                </div>
              </div>
              <span style={{ fontSize: 13.5 }}>
                {c.notify ? (
                  <>
                    <b>{c.notify.toLocaleString('en-NG')} readers</b> tapped Notify me and get one push when it goes
                    live.
                  </>
                ) : (
                  'Nobody has tapped Notify me yet. Readers who do get one push when it goes live.'
                )}
              </span>
            </>
          )}
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href="/curation">
            Cancel
          </Link>
          <button type="button" className="btn btn-p" disabled={!c || busy} onClick={save}>
            Save entry
          </button>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
