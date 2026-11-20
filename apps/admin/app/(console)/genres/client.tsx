'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { banTag, mergeTags, reorderGenres, setGenreVisible } from './actions';

export interface GenreRow {
  id: string;
  name: string;
  visible: boolean;
  books: number;
  readers: number;
}
export interface TagRow {
  id: string;
  name: string;
  books: number;
}
export interface MergeSuggestion {
  keep: TagRow;
  merge: TagRow[];
  books: number;
}

const n = (v: number) => v.toLocaleString('en-NG');

/**
 * Genres and tags (s-genres). Genres: drag (or Alt+↑/↓) to reorder, switch to show or hide
 * (hidden genres leave onboarding but stay on books). Tags: merge suggestions and banned words.
 */
export function GenresView({
  genres,
  tags,
  suggestions,
  banned: bannedWords,
  error,
}: {
  genres: GenreRow[];
  tags: TagRow[];
  suggestions: MergeSuggestion[];
  banned: string[];
  error: boolean;
}) {
  const [rows, setRows] = useState(genres);
  const [sugg, setSugg] = useState(suggestions);
  const [banned, setBanned] = useState(bannedWords);
  const [word, setWord] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const [busy, start] = useTransition();
  const [toastNode, showToast] = useToast();

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const prev = rows;
    const next = [...rows];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    setRows(next);
    start(async () => {
      const r = await reorderGenres(next.map(g => g.id));
      if (!r.ok) {
        setRows(prev);
        return showToast(r.error ?? "Couldn't save the order.");
      }
      showToast('Order saved. Onboarding and Browse use it within a minute.', () => {
        setRows(prev);
        void reorderGenres(prev.map(g => g.id));
      });
    });
  };
  const toggle = (g: GenreRow) => {
    const prev = rows;
    setRows(rows.map(x => (x.id === g.id ? { ...x, visible: !x.visible } : x)));
    start(async () => {
      const r = await setGenreVisible(g.id, !g.visible);
      if (!r.ok) {
        setRows(prev);
        return showToast(r.error ?? "Couldn't save that.");
      }
      showToast(
        g.visible ? `${g.name} hidden from onboarding and Browse. Books keep it.` : `${g.name} shown again.`,
        () => {
          setRows(prev);
          void setGenreVisible(g.id, g.visible);
        },
      );
    });
  };
  const merge = (s: MergeSuggestion) =>
    start(async () => {
      const r = await mergeTags(
        s.merge.map(t => t.id),
        s.keep.id,
      );
      if (!r.ok) return showToast(r.error ?? "Couldn't merge.");
      setSugg(list => list.filter(x => x.keep.id !== s.keep.id));
      showToast(`Merged into “${s.keep.name}”. ${n(s.books)} books updated.`);
    });
  const ban = () => {
    const w = word.trim();
    if (!w) return;
    start(async () => {
      const r = await banTag(w);
      if (!r.ok) return showToast(r.error ?? "Couldn't ban that word.");
      setBanned(b => [...new Set([...b, w.toLowerCase()])].sort());
      setWord('');
      showToast('Word banned. It is removed from new uploads and authors are told.');
    });
  };

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Genres and tags</h1>
          </div>
          <div className="band__acts">
            <button
              type="button"
              className="btn btn-n"
              onClick={() => showToast('Adding a genre comes with Admin settings, a later part of the build.')}
            >
              <Icon name="plus" size="s" />
              Add genre
            </button>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Genres</h2>
              <span className="sub">Drag to reorder; saved as you go</span>
            </div>
            <div className="tw">
              {error ? (
                <div className="empty" style={{ padding: '40px 24px' }}>
                  <b>Couldn&apos;t load genres</b>
                  <span>Refresh the page to try again.</span>
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Genre</th>
                      <th className="r">Books</th>
                      <th className="r">Chose it in onboarding</th>
                      <th>Visible</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g, i) => (
                      <tr
                        key={g.id}
                        draggable
                        tabIndex={0}
                        aria-label={`${g.name}, position ${i + 1}. Alt and arrow keys move it.`}
                        onDragStart={() => setDrag(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          if (drag != null) move(drag, i);
                          setDrag(null);
                        }}
                        onDragEnd={() => setDrag(null)}
                        onKeyDown={e => {
                          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                          e.preventDefault();
                          move(i, e.key === 'ArrowUp' ? i - 1 : i + 1);
                        }}
                        style={{ cursor: 'grab', opacity: drag === i ? 0.5 : undefined }}
                      >
                        <td>
                          <b>{i + 1}</b>
                        </td>
                        <td>
                          <b>{g.name}</b>
                        </td>
                        <td className="n">{n(g.books)}</td>
                        <td className="n">{n(g.readers)}</td>
                        <td>
                          <button
                            type="button"
                            className={`switch${g.visible ? ' on' : ''}`}
                            role="switch"
                            aria-checked={g.visible}
                            aria-label={`Show ${g.name}`}
                            disabled={busy}
                            onClick={() => toggle(g)}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-g sm"
                            onClick={() =>
                              showToast(`Renaming ${g.name} comes with Admin settings. Order and visibility save here.`)
                            }
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Merge suggestions</h2>
              </div>
              <div className="list">
                {sugg.length ? (
                  sugg.map(s => (
                    <div className="li" key={s.keep.id}>
                      <span className="li__body">
                        <b>{[s.keep, ...s.merge].map(t => t.name).join(' + ')}</b>
                        <small>
                          {n(s.books)} books · keep &quot;{s.keep.name}&quot;
                        </small>
                      </span>
                      <button type="button" className="btn btn-s sm" disabled={busy} onClick={() => merge(s)}>
                        Merge
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="li">
                    <span className="li__body">
                      <b>Nothing to merge</b>
                      <small>Tags that only differ by spelling or capitals show up here.</small>
                    </span>
                  </div>
                )}
              </div>
            </div>
            <details className="fold">
              <summary>
                Tags and banned tags <small>{n(tags.length)} tags</small>
              </summary>
              <div className="fold__b">
                <div className="ct-tags">
                  {tags.slice(0, 30).map(t => (
                    <span className="tag" key={t.id}>
                      {t.name}
                      <small>{n(t.books)}</small>
                    </span>
                  ))}
                </div>
                <b style={{ fontSize: 13 }}>Banned tags</b>
                <div className="ct-tags">
                  {banned.length ? (
                    banned.map(w => (
                      <span className="tag" key={w}>
                        {w}
                      </span>
                    ))
                  ) : (
                    <span className="hint">No banned words yet.</span>
                  )}
                </div>
                <div className="row">
                  <label className="search" style={{ minWidth: 0 }}>
                    <input
                      placeholder="Add a banned word"
                      aria-label="Banned tag"
                      value={word}
                      onChange={e => setWord(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && ban()}
                    />
                  </label>
                  <button type="button" className="btn btn-g sm" disabled={busy || !word.trim()} onClick={ban}>
                    Ban
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
