'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { reorderSections, setSectionVisible } from './actions';

export interface SectionRow {
  id: string;
  key: string;
  title: string;
  kind: string;
  visible: boolean;
  detail: string;
}

const KIND_LABEL: Record<string, string> = { curated: 'Curated', automatic: 'Automatic', algorithm: 'Algorithm' };

/** Where each section's Edit goes; the rest say what they would edit (as the prototype's toasts). */
const EDIT_HREF: Record<string, string> = {
  trending: '/curation/trending',
  coming_soon: '/curation/coming',
  genres: '/genres',
};

/**
 * Discover curation (s-curation): sections top to bottom as in the app, drag (or Alt+↑/↓) to
 * reorder, saved as you go; the switch shows or hides a section; Edit opens its editor.
 */
export function CurationView({
  sections,
  error,
  notice,
}: {
  sections: SectionRow[];
  error: boolean;
  /** A message carried over from an editor that just saved (Coming soon). */
  notice?: string;
}) {
  const [rows, setRows] = useState(sections);
  const [drag, setDrag] = useState<number | null>(null);
  const [, start] = useTransition();
  const [toastNode, showToast] = useToast();
  useEffect(() => {
    if (notice) showToast(notice);
  }, [notice, showToast]);

  const saveOrder = (next: SectionRow[], prev: SectionRow[]) => {
    setRows(next);
    start(async () => {
      const r = await reorderSections(next.map(s => s.id));
      if (r.ok) showToast('Order saved. Live in the app within a minute.', () => {
        setRows(prev);
        void reorderSections(prev.map(s => s.id));
      });
      else {
        setRows(prev);
        showToast(r.error ?? "Couldn't save the order.");
      }
    });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    saveOrder(next, rows);
  };
  const toggle = (i: number) => {
    const s = rows[i]!;
    const prev = rows;
    setRows(rows.map((r, k) => (k === i ? { ...r, visible: !r.visible } : r)));
    start(async () => {
      const r = await setSectionVisible(s.id, !s.visible);
      if (r.ok)
        showToast(`${s.title} ${s.visible ? 'hidden' : 'shown'}. Live in the app within a minute.`, () => {
          setRows(prev);
          void setSectionVisible(s.id, s.visible);
        });
      else {
        setRows(prev);
        showToast(r.error ?? "Couldn't save that.");
      }
    });
  };

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Discover curation</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/curation/trending">
              Edit Trending
            </Link>
            <Link className="ib" href="/search-tuning" aria-label="Search tuning">
              <Icon name="search" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="stack s20">
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Home sections</h2>
              <span className="sub">Top to bottom in the app. Drag to reorder; saved as you go.</span>
            </div>
            <div>
              {error ? (
                <div className="empty" style={{ padding: '40px 24px' }}>
                  <b>Couldn&apos;t load the sections</b>
                  <span>Refresh the page to try again.</span>
                </div>
              ) : null}
              {rows.map((s, i) => (
                <div
                  key={s.id}
                  className="ct-order"
                  draggable
                  tabIndex={0}
                  aria-label={`${s.title}, position ${i + 1} of ${rows.length}. Alt and arrow keys move it.`}
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
                  <span className="ct-rank">{i + 1}</span>
                  <span className="li__body">
                    <b>{s.title}</b>
                    <small>{s.detail}</small>
                  </span>
                  <button
                    type="button"
                    className={`switch${s.visible ? ' on' : ''}`}
                    role="switch"
                    aria-checked={s.visible}
                    aria-label={`Show ${s.title} in the app`}
                    onClick={() => toggle(i)}
                  />
                  {EDIT_HREF[s.key] ? (
                    <Link className="btn btn-g sm" href={EDIT_HREF[s.key]!}>
                      Edit
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-g sm"
                      onClick={() => showToast(`Editing ${s.title} comes with a later part of the build.`)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <details className="fold">
            <summary>
              Preview in the app <small>hidden sections are dimmed</small>
            </summary>
            <div className="fold__b">
              <div>
                <div className="phone">
                  <div className="phone__s">
                    <div className="ct-rbar">
                      <span>Arpedia</span>
                      <span>Home</span>
                    </div>
                    <div className="ct-mini">
                      {rows.map(s => (
                        <span key={s.id} className={s.visible ? '' : 'off'}>
                          {s.title}
                          <small>{s.visible ? (KIND_LABEL[s.kind] ?? s.kind) : 'Hidden'}</small>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
