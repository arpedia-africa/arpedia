'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { CATEGORIES, CATEGORY_LABEL, dayMonth, showsLabel, type HelpCategory } from './labels';

export interface HelpRow {
  id: string;
  title: string;
  category: HelpCategory;
  showsIn: string[];
  state: 'draft' | 'published';
  views: number;
  helpful: number | null;
  needsRewrite: boolean;
  updatedAt: string;
}

const num = (n: number) => n.toLocaleString('en-NG');

/** s-help. One row of category chips; only Draft gets a pill; under 70% helpful is bold. */
export function HelpView({ rows, failed }: { rows: HelpRow[]; failed: boolean }) {
  const router = useRouter();
  const [cat, setCat] = useState<HelpCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (cat === 'all' || r.category === cat) && (!needle || r.title.toLowerCase().includes(needle)),
  );
  const count = (c: HelpCategory) => rows.filter((r) => r.category === c).length;
  const go = (id: string) => router.push(`/help/${id}`);

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Help articles</h1>
          </div>
          <div className="band__acts">
            <a className="btn btn-n" href="/help/new">
              <Icon name="plus" />
              New article
            </a>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input
              placeholder="Search articles"
              aria-label="Search articles"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <span className="row">
            <button
              type="button"
              className={`fchip${cat === 'all' ? ' is-selected' : ''}`}
              onClick={() => setCat('all')}
            >
              All <span className="c">{num(rows.length)}</span>
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`fchip${cat === c.key ? ' is-selected' : ''}`}
                onClick={() => setCat(c.key)}
              >
                {c.label} <span className="c">{num(count(c.key))}</span>
              </button>
            ))}
          </span>
        </div>
        <div className="panel panel--flush">
          {failed ? (
            <div className="empty">
              <b>Help articles didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">
              <b>{rows.length === 0 ? 'No help articles yet' : 'No articles match'}</b>
              <span>
                {rows.length === 0
                  ? 'Write the first one with New article. It shows in the app Help screen and on the website.'
                  : 'Try another word or category.'}
              </span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Status</th>
                    <th className="r">Views, 30 days</th>
                    <th className="r">Helpful</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      onClick={() => go(r.id)}
                      onKeyDown={(e) => e.key === 'Enter' && go(r.id)}
                    >
                      <td>
                        <b>{r.title}</b>
                        <br />
                        <small className="faint">{`${CATEGORY_LABEL[r.category]} · ${showsLabel(r.showsIn)}`}</small>
                      </td>
                      <td>{r.state === 'draft' ? <span className="st st-warn">Draft</span> : 'Published'}</td>
                      <td className="n">{num(r.views)}</td>
                      <td className="n">
                        {r.helpful == null ? (
                          'n/a'
                        ) : r.needsRewrite ? (
                          <b>{`${r.helpful}%`}</b>
                        ) : (
                          `${r.helpful}%`
                        )}
                      </td>
                      <td className="nw">{dayMonth(r.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!failed && shown.length > 0 ? (
            <div className="pager">
              <span>{`${num(shown.length)} of ${num(rows.length)} ${rows.length === 1 ? 'article' : 'articles'}`}</span>
              <span>Articles under 70% helpful are worth rewriting</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
