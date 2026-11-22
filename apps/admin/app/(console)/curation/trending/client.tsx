'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type CSSProperties } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { discardDraft, findBooks, publishShelf, saveDraft, setSectionConfig } from '../actions';

export interface ShelfBook {
  id: string;
  title: string;
  author: string;
  pinned: boolean;
  /** False when the book is no longer live (publishing would fail until it is removed). */
  live: boolean;
  cover: string;
}

const MAX = 10;
const n = (v: number) => v.toLocaleString('en-NG');

/** Plain-words list of what the draft changes against the live shelf. */
function changes(live: ShelfBook[], draft: ShelfBook[]): string[] {
  const out: string[] = [];
  draft.forEach((b, i) => {
    const was = live.findIndex(l => l.id === b.id);
    if (was < 0) out.push(`${b.title} added`);
    else if (was !== i) out.push(`${b.title} moved to ${i + 1}`);
    if (was >= 0 && live[was]!.pinned !== b.pinned) out.push(`${b.title} ${b.pinned ? 'pinned' : 'unpinned'}`);
  });
  live.forEach(l => {
    if (!draft.some(d => d.id === l.id)) out.push(`${l.title} removed`);
  });
  return out;
}

/**
 * Edit Trending this week (s-curation-trending). Every change saves the section's draft; the app
 * keeps the live shelf until Publish changes. Discard drops the draft. 10 books at most; a pinned
 * book keeps its position through the weekly rotation.
 */
export function TrendingEditor({
  sectionId,
  live,
  draft: savedDraft,
  rotate: rotateOn,
  edited,
  taps,
  tapsWeek,
}: {
  sectionId: string;
  live: ShelfBook[];
  draft: ShelfBook[] | null;
  rotate: boolean;
  edited: string | null;
  taps: { position: number; taps: number }[];
  tapsWeek: string | null;
}) {
  const router = useRouter();
  const [list, setList] = useState<ShelfBook[]>(savedDraft ?? live);
  const [rotate, setRotate] = useState(rotateOn);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; title: string; author: string }[]>([]);
  const [busy, start] = useTransition();
  const [toastNode, showToast] = useToast();
  const diff = changes(live, list);

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => void findBooks(q).then(setFound), 250);
    return () => clearTimeout(t);
  }, [q]);

  const commit = (next: ShelfBook[], msg: string) => {
    const prev = list;
    setList(next);
    start(async () => {
      const r = await saveDraft(
        sectionId,
        next.map(b => ({ item_type: 'book', item_id: b.id, pinned: b.pinned })),
      );
      if (!r.ok) {
        setList(prev);
        return showToast(r.error ?? "Couldn't save that.");
      }
      showToast(msg, () => {
        setList(prev);
        void saveDraft(
          sectionId,
          prev.map(b => ({ item_type: 'book', item_id: b.id, pinned: b.pinned })),
        );
      });
    });
  };
  const move = (i: number, d: -1 | 1) => {
    const b = list[i]!;
    const to = i + d;
    if (to < 0) return showToast(`${b.title} is already first`);
    if (to >= list.length) return showToast(`${b.title} is already last`);
    const next = [...list];
    next.splice(i, 1);
    next.splice(to, 0, b);
    commit(next, `${b.title} moved ${d < 0 ? 'up' : 'down'} to ${to + 1}`);
  };
  const add = (book: { id: string; title: string; author: string }) => {
    if (list.some(b => b.id === book.id)) return showToast(`${book.title} is already on Trending`);
    let next = [...list, { ...book, pinned: false, live: true, cover: '' }];
    let msg = `${book.title} added at the end.`;
    if (next.length > MAX) {
      // Trending holds 10: the lowest unpinned book moves out.
      const out = [...next].reverse().find(b => !b.pinned && b.id !== book.id);
      if (!out) return showToast('Trending holds 10 books and they are all pinned. Unpin or remove one first.');
      next = next.filter(b => b.id !== out.id);
      msg += ` Trending holds 10, so ${out.title} moves out.`;
    }
    setQ('');
    setFound([]);
    commit(next, msg);
  };

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/curation">Discover curation</Link>
          <Icon name="chev" size="s" />
          <span>Trending this week</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>Trending this week</h1>
            <div className="ph__meta">
              <span>Live in the app · curated, {n(live.length)} books</span>
              {edited ? <span>{edited}</span> : null}
            </div>
          </div>
          <div className="ph__acts">
            <button
              type="button"
              className="btn btn-g"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await discardDraft(sectionId);
                  if (!r.ok) return showToast(r.error ?? "Couldn't discard.");
                  setList(live);
                  showToast('Changes discarded. Trending is unchanged in the app.');
                })
              }
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-p"
              disabled={busy || !diff.length}
              onClick={() =>
                start(async () => {
                  const r = await publishShelf(sectionId);
                  if (!r.ok) return showToast(r.error ?? "Couldn't publish.");
                  showToast('Trending updated in the app');
                  router.refresh();
                })
              }
            >
              Publish changes
            </button>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Order in the app</h2>
                <label className="search" style={{ position: 'relative' }}>
                  <Icon name="search" size="s" />
                  <input
                    placeholder="Add a book"
                    aria-label="Add a book"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && found[0] && add(found[0])}
                  />
                  {found.length ? (
                    <div className="menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5 }}>
                      {found.map(b => (
                        <a key={b.id} role="button" tabIndex={0} onClick={() => add(b)} onKeyDown={e => e.key === 'Enter' && add(b)}>
                          {b.title} <span className="muted">· {b.author}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </label>
                <button
                  type="button"
                  className="btn btn-g sm"
                  disabled={!found.length}
                  onClick={() => found[0] && add(found[0])}
                >
                  Add
                </button>
              </div>
              {list.length === 0 ? (
                <div className="empty" style={{ padding: '40px 24px' }}>
                  <b>No books on Trending</b>
                  <span>Add up to 10 live books. The shelf is hidden in the app while it is empty.</span>
                </div>
              ) : null}
              {list.map((b, i) => (
                <div className="ct-item" key={b.id}>
                  <span className="ct-rank">{i + 1}</span>
                  <span className={`cv ${b.cover || 'c1'} x32`} />
                  <span className="grow">
                    <b>{b.title}</b>
                    <small>
                      {[b.author, b.pinned ? 'Pinned' : null, b.live ? null : 'No longer live'].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="ib sm"
                    aria-label={b.pinned ? 'Unpin' : 'Pin'}
                    aria-pressed={b.pinned}
                    onClick={() =>
                      commit(
                        list.map(x => (x.id === b.id ? { ...x, pinned: !x.pinned } : x)),
                        b.pinned ? `${b.title} unpinned` : `${b.title} pinned at ${i + 1}. It stays there through rotations.`,
                      )
                    }
                    style={b.pinned ? { color: 'var(--org-ink)' } : undefined}
                  >
                    <Icon name="pin" />
                  </button>
                  <button type="button" className="ib sm" aria-label="Move up" onClick={() => move(i, -1)}>
                    <Icon name="arrowup" />
                  </button>
                  <button type="button" className="ib sm" aria-label="Move down" onClick={() => move(i, 1)}>
                    <Icon name="arrowdown" />
                  </button>
                  <button
                    type="button"
                    className="ib sm"
                    aria-label="Remove"
                    onClick={() => commit(list.filter(x => x.id !== b.id), `${b.title} removed from Trending`)}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ))}
              {diff.length ? (
                <div className="panel__foot">
                  <span>
                    {diff.length} change{diff.length === 1 ? '' : 's'} not published yet: {diff.join(', ')}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Schedule</h2>
              </div>
              <div className="list">
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Rotate weekly</b>
                    <small>
                      Every Monday 06:00 WAT the lowest 2 move out and the next 2 most read come in. Pinned books
                      stay.
                    </small>
                  </span>
                  <button
                    type="button"
                    className={`switch${rotate ? ' on' : ''}`}
                    role="switch"
                    aria-checked={rotate}
                    aria-label="Rotate weekly"
                    onClick={() => {
                      const next = !rotate;
                      setRotate(next);
                      start(async () => {
                        const r = await setSectionConfig(sectionId, { rotate_weekly: next });
                        if (!r.ok) {
                          setRotate(!next);
                          return showToast(r.error ?? "Couldn't save that.");
                        }
                        showToast(next ? 'Weekly rotation is on' : 'Weekly rotation is off');
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <details className="fold">
          <summary>
            Last week&apos;s taps by position {tapsWeek ? <small>week of {tapsWeek}</small> : null}
          </summary>
          <div className="fold__b">
            {taps.length ? (
              <>
                <div className="hbars">
                  {taps.map(t => (
                    <div className="hb" key={t.position}>
                      <span>Position {t.position}</span>
                      <span className="track">
                        <i
                          style={
                            {
                              '--v': `${Math.round((t.taps / Math.max(...taps.map(x => x.taps), 1)) * 100)}%`,
                            } as CSSProperties
                          }
                        />
                      </span>
                      <b>{n(t.taps)}</b>
                    </div>
                  ))}
                </div>
                <span className="hint">Put the books you want discovered in the top 3.</span>
              </>
            ) : (
              <span className="hint">No taps counted last week yet.</span>
            )}
          </div>
        </details>
      </div>
      {toastNode}
    </section>
  );
}
