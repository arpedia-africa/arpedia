'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { findBooks } from '../curation/actions';
import { findLinkableBooks, linkRequest, saveTuning, setRequestStatus, type TuningChanges } from './actions';

export interface QueryRow {
  query: string;
  searches: number;
  tapRate: number;
}
export interface ZeroRow {
  query: string;
  searches: number;
  wishlisted: boolean;
  /** At least one reader tapped "Ask for this book" (only those can be linked and told). */
  requested: boolean;
}
export interface Synonym {
  id: string;
  terms: string[];
  by: string | null;
}
export interface Promotion {
  id: string;
  query: string;
  book: string;
  position: number;
  until: string;
}
interface Settings {
  typo: boolean;
  authors: boolean;
  unreleased: boolean;
}
interface NewPromo {
  query: string;
  bookId: string;
  book: string;
  position: number;
  until: string;
}

const n = (v: number) => v.toLocaleString('en-NG');
const ARROW = ' ↔ ';

/**
 * Search tuning (s-search-tuning). Wishlist taps save at once (with Undo); synonyms, promoted
 * results and search behaviour collect until Save changes.
 */
export function TuningView({
  top,
  zero,
  synonyms,
  promotions,
  settings: saved,
  canSeeEvents,
}: {
  top: QueryRow[];
  zero: ZeroRow[];
  synonyms: Synonym[];
  promotions: Promotion[];
  settings: Settings;
  canSeeEvents: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toastNode, showToast] = useToast();
  const [zeroRows, setZero] = useState(zero);
  const [settings, setSettings] = useState(saved);
  const [synAdd, setSynAdd] = useState<string[][]>([]);
  const [synRemove, setSynRemove] = useState<string[]>([]);
  const [synText, setSynText] = useState('');
  const [proAdd, setProAdd] = useState<NewPromo[]>([]);
  const [proRemove, setProRemove] = useState<string[]>([]);
  const [draft, setDraft] = useState<NewPromo>({ query: '', bookId: '', book: '', position: 1, until: '' });
  const [found, setFound] = useState<{ id: string; title: string; author: string }[]>([]);
  const [linking, setLinking] = useState<{ query: string; text: string } | null>(null);
  const [linkFound, setLinkFound] = useState<{ id: string; title: string; author: string; status: string }[]>([]);

  useEffect(() => {
    if (draft.bookId || draft.book.trim().length < 2) return setFound([]);
    const t = setTimeout(() => void findBooks(draft.book).then(setFound), 250);
    return () => clearTimeout(t);
  }, [draft.book, draft.bookId]);

  useEffect(() => {
    if (!linking || linking.text.trim().length < 2) return setLinkFound([]);
    let live = true;
    const t = setTimeout(
      () =>
        void findLinkableBooks(linking.text).then(rows => {
          if (live) setLinkFound(rows);
        }),
      250,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [linking]);

  const settingsChanged =
    settings.typo !== saved.typo || settings.authors !== saved.authors || settings.unreleased !== saved.unreleased;
  const dirty = settingsChanged || synAdd.length + synRemove.length + proAdd.length + proRemove.length > 0;

  const wishlist = (row: ZeroRow) =>
    start(async () => {
      const r = await setRequestStatus(row.query, 'wishlist');
      if (!r.ok) return showToast(r.error ?? "Couldn't update the wishlist.");
      setZero(z => z.map(x => (x.query === row.query ? { ...x, wishlisted: true } : x)));
      showToast(`“${row.query}” added to the acquisition wishlist`, () => {
        setZero(z => z.map(x => (x.query === row.query ? { ...x, wishlisted: false } : x)));
        void setRequestStatus(row.query, 'open');
      });
    });
  const link = (query: string, book: { id: string; title: string; status: string }) =>
    start(async () => {
      const r = await linkRequest(query, book.id);
      if (!r.ok) return showToast(r.error ?? "Couldn't link the request.");
      setLinking(null);
      setZero(z => z.filter(x => x.query !== query));
      if (!r.linked) return showToast(`Nobody is waiting on “${query}” any more. Another admin already handled it.`);
      const who = r.linked === 1 ? 'The reader who asked' : `The ${n(r.linked ?? 0)} readers who asked`;
      showToast(
        book.status === 'live'
          ? `“${query}” linked to ${book.title}. ${who} ${r.linked === 1 ? 'has' : 'have'} been told.`
          : `“${query}” linked to ${book.title}. ${who} will be told when it goes live.`,
      );
    });
  const addSynonym = () => {
    const terms = synText
      .split(/↔|<->|,/)
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
    if (terms.length < 2) return showToast('Type two or more words, like romance ↔ love story.');
    setSynAdd(s => [...s, terms]);
    setSynText('');
  };
  const addPromo = () => {
    if (!draft.query.trim() || !draft.bookId) return showToast('Pick a search and a book to promote.');
    setProAdd(p => [...p, { ...draft, query: draft.query.trim().toLowerCase() }]);
    setDraft({ query: '', bookId: '', book: '', position: 1, until: '' });
  };
  const save = () => {
    const changes: TuningChanges = {};
    if (settingsChanged)
      changes.settings = {
        typo_distance: settings.typo ? 2 : 0,
        include_authors: settings.authors,
        show_unreleased: settings.unreleased,
      };
    if (synAdd.length || synRemove.length) {
      changes.synonyms_add = synAdd;
      changes.synonyms_remove = synRemove;
    }
    if (proAdd.length || proRemove.length) {
      changes.promotions_add = proAdd.map(p => ({
        query: p.query,
        book_id: p.bookId,
        position: p.position,
        expires_at: p.until ? new Date(`${p.until}T23:59:59+01:00`).toISOString() : null,
      }));
      changes.promotions_remove = proRemove;
    }
    start(async () => {
      const r = await saveTuning(changes);
      if (!r.ok) return showToast(r.error ?? "Couldn't save.");
      setSynAdd([]);
      setSynRemove([]);
      setProAdd([]);
      setProRemove([]);
      showToast('Search changes saved. Live in the app within a minute.');
      router.refresh();
    });
  };

  const synList = [
    ...synonyms.filter(s => !synRemove.includes(s.id)).map(s => ({ key: s.id, terms: s.terms, by: s.by, fresh: false })),
    ...synAdd.map((t, i) => ({ key: `new-${i}`, terms: t, by: null, fresh: true })),
  ];
  const proList = [
    ...promotions.filter(p => !proRemove.includes(p.id)).map(p => ({ ...p, key: p.id, fresh: false })),
    ...proAdd.map((p, i) => ({
      key: `new-${i}`,
      id: '',
      query: p.query,
      book: p.book,
      position: p.position,
      until: p.until ? new Date(p.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Ongoing',
      fresh: true,
    })),
  ];
  const setRow = (k: keyof Settings, title: string, sub: string) => (
    <div className="setrow">
      <span className="setrow__b">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <button
        type="button"
        className={`switch${settings[k] ? ' on' : ''}`}
        role="switch"
        aria-checked={settings[k]}
        aria-label={title}
        onClick={() => setSettings(s => ({ ...s, [k]: !s[k] }))}
      />
    </div>
  );

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/curation">Discover curation</Link>
          <Icon name="chev" size="s" />
          <span>Search tuning</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>Search tuning</h1>
            <div className="ph__meta">
              <span>What readers type and what they find</span>
            </div>
          </div>
          <div className="ph__acts">
            <button type="button" className="btn btn-p" disabled={!dirty || busy} onClick={save}>
              Save changes
            </button>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="ct-two">
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Top searches this week</h2>
              </div>
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th className="r">Searches</th>
                      <th className="r">Tapped a result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map(r => (
                      <tr key={r.query}>
                        <td>{r.query}</td>
                        <td className="n">{n(r.searches)}</td>
                        <td className="n">{r.tapRate}%</td>
                      </tr>
                    ))}
                    {!top.length ? (
                      <tr>
                        <td colSpan={3} className="muted">
                          {canSeeEvents ? 'No searches this week yet.' : 'Search numbers are open to Analysts and Operations admins.'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Searches with no results</h2>
                <span className="sub">Books readers want</span>
              </div>
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th className="r">Searches</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeroRows.map(r => (
                      <tr key={r.query}>
                        <td>{r.query}</td>
                        <td className="n">{n(r.searches)}</td>
                        <td style={{ position: 'relative' }}>
                          {linking?.query === r.query ? (
                            <div className="row">
                              <label className="search" style={{ minWidth: 0, flex: 1 }}>
                                <input
                                  autoFocus
                                  placeholder="Find the book"
                                  aria-label={`Book to link to “${r.query}”`}
                                  value={linking.text}
                                  onChange={e => setLinking({ query: r.query, text: e.target.value })}
                                  onKeyDown={e => e.key === 'Escape' && setLinking(null)}
                                />
                              </label>
                              <button type="button" className="btn btn-g sm" onClick={() => setLinking(null)}>
                                Cancel
                              </button>
                              {linkFound.length ? (
                                <div className="menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5 }}>
                                  {linkFound.map(b => (
                                    <a
                                      key={b.id}
                                      role="button"
                                      tabIndex={0}
                                      aria-disabled={busy}
                                      onClick={() => !busy && link(r.query, b)}
                                      onKeyDown={e => e.key === 'Enter' && !busy && link(r.query, b)}
                                    >
                                      {b.title}{' '}
                                      <span className="muted">
                                        · {b.author}
                                        {b.status === 'live' ? '' : b.status === 'scheduled' ? ' · Coming soon' : ' · Not published yet'}
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="row" style={{ justifyContent: 'flex-end' }}>
                              {r.wishlisted ? (
                                <span className="tag">On the wishlist</span>
                              ) : (
                                <button type="button" className="btn btn-g sm" disabled={busy} onClick={() => wishlist(r)}>
                                  Add to wishlist
                                </button>
                              )}
                              {r.requested ? (
                                <button
                                  type="button"
                                  className="btn btn-g sm"
                                  disabled={busy}
                                  onClick={() => setLinking({ query: r.query, text: '' })}
                                >
                                  Link to a book
                                </button>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!zeroRows.length ? (
                      <tr>
                        <td colSpan={3} className="muted">
                          Every search found something this week.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Synonyms</h2>
              </div>
              <div className="list">
                {synList.map(s => (
                  <div className="li" key={s.key}>
                    <span className="li__body">
                      <b>{s.terms.join(ARROW)}</b>
                      {s.fresh ? <small>Not saved yet</small> : s.by ? <small>Added by {s.by}</small> : null}
                    </span>
                    <button
                      type="button"
                      className="ib sm"
                      aria-label="Remove"
                      onClick={() =>
                        s.fresh
                          ? setSynAdd(a => a.filter((_, i) => `new-${i}` !== s.key))
                          : setSynRemove(r => [...r, s.key])
                      }
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
                {!synList.length ? (
                  <div className="li">
                    <span className="li__body">
                      <small>No synonyms yet. Add words readers use for the same thing.</small>
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="panel__foot">
                <label className="search" style={{ minWidth: 0 }}>
                  <input
                    placeholder="word ↔ word"
                    aria-label="Add synonym"
                    value={synText}
                    onChange={e => setSynText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSynonym()}
                  />
                </label>
                <button type="button" className="btn btn-g sm" onClick={addSynonym}>
                  Add
                </button>
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Promoted results</h2>
              </div>
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th>Book</th>
                      <th>Position</th>
                      <th>Until</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proList.map(p => (
                      <tr key={p.key}>
                        <td>{p.query}</td>
                        <td>{p.book}</td>
                        <td>{p.position}</td>
                        <td>{p.fresh ? `${p.until} · not saved` : p.until}</td>
                        <td>
                          <button
                            type="button"
                            className="ib sm"
                            aria-label="Remove"
                            onClick={() =>
                              p.fresh
                                ? setProAdd(a => a.filter((_, i) => `new-${i}` !== p.key))
                                : setProRemove(r => [...r, p.id])
                            }
                          >
                            <Icon name="x" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!proList.length ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          No promoted results. They show first in the app, labelled Promoted.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="panel__foot" style={{ position: 'relative' }}>
                <label className="search" style={{ minWidth: 0, flex: 1 }}>
                  <input
                    placeholder="Search words"
                    aria-label="Promoted search"
                    value={draft.query}
                    onChange={e => setDraft(d => ({ ...d, query: e.target.value }))}
                  />
                </label>
                <label className="search" style={{ minWidth: 0, flex: 1 }}>
                  <input
                    placeholder="Book"
                    aria-label="Promoted book"
                    value={draft.book}
                    onChange={e => setDraft(d => ({ ...d, book: e.target.value, bookId: '' }))}
                  />
                </label>
                <select
                  className="inp"
                  aria-label="Position"
                  value={draft.position}
                  onChange={e => setDraft(d => ({ ...d, position: Number(e.target.value) }))}
                  style={{ width: 'auto' }}
                >
                  {[1, 2, 3].map(x => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
                <input
                  className="inp"
                  type="date"
                  aria-label="Until (optional)"
                  value={draft.until}
                  onChange={e => setDraft(d => ({ ...d, until: e.target.value }))}
                  style={{ width: 'auto' }}
                />
                <button type="button" className="btn btn-g sm" onClick={addPromo}>
                  Add
                </button>
                {found.length ? (
                  <div className="menu" style={{ position: 'absolute', top: '100%', left: 18, right: 18, zIndex: 5 }}>
                    {found.map(b => (
                      <a
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDraft(d => ({ ...d, bookId: b.id, book: b.title }))}
                        onKeyDown={e => e.key === 'Enter' && setDraft(d => ({ ...d, bookId: b.id, book: b.title }))}
                      >
                        {b.title} <span className="muted">· {b.author}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <details className="fold">
          <summary>
            Search behaviour <small>typo tolerance, author names, unreleased books</small>
          </summary>
          <div className="fold__b">
            {setRow('typo', 'Typo tolerance', 'Finds Harmatan Leters when readers misspell; up to 2 letters')}
            {setRow('authors', 'Search author names', 'Include author names in results')}
            {setRow('unreleased', 'Show unreleased books', 'Coming soon books appear in results')}
          </div>
        </details>
      </div>
      {toastNode}
    </section>
  );
}
