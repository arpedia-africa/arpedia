import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { buckets, change, count, dash, metrics, num } from './data';
import { finishedShare, latest, share, stickiness } from './overview';
import { period } from './period';
import { AnalyticsFrame, Columns, Hbars, NoData } from './shared';

export const metadata: Metadata = { title: 'Analytics · Arpedia Admin' };

interface BookRow {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  hours: number;
  unlocks: number;
  /** Null for fewer than 5 readers. */
  readers: number | null;
  finished_pct: number | null;
  rating: number | null;
}
interface Books {
  top: BookRow[];
  genres: { genre: string; share: number }[];
  /** Readers who reached the end of a priced book's free preview, and the share who unlocked it. */
  preview_unlock?: { readers: number; share: number | null; bands: { label: string; share: number | null }[] };
}

const COVERS = ['c1', 'c3', 'c2', 'c6', 'c4', 'c5', 'c7', 'c8'];
const READING = 'Counted from reading sessions of 30 seconds or more, which start with the Reading flow.';

/** s-analytics: readers, reading hours, top books and genre share for the period, against the previous one. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const p = period((await searchParams).p);
  const staff = await requireStaff();
  if (!staff.permissions.includes('view_analytics'))
    return <NoAccess page="analytics" label="Analytics" role={staff.role} />;
  const supabase = await serverSupabase();
  const [{ data: m, error }, books, today] = await Promise.all([
    metrics(['dau', 'mau', 'reading_hours', 'sessions', 'unlocks', 'books_finished', 'books_started'], p),
    supabase.rpc('staff_analytics_books', { p_from: p.from, p_to: p.to }),
    supabase.rpc('staff_analytics_books', { p_from: p.to, p_to: p.to, p_limit: 5 }),
  ]);
  const b = (books.data as unknown as Books | null) ?? { top: [], genres: [] };
  const t = (today.data as unknown as Books | null) ?? { top: [], genres: [] };

  const dau = m.dau;
  const avgDau = dau?.total != null ? dau.total / p.days : null;
  const hours = m.reading_hours?.total ?? null;
  const sessions = m.sessions?.total ?? null;
  const perSession = hours && sessions ? `${Math.round((hours * 60) / sessions)} min per session` : 'Minutes per session';

  const mau = latest(m.mau);
  const finished = m.books_finished?.total ?? null;
  const preview = b.preview_unlock;

  const cols = buckets(p, m, ['dau', 'reading_hours', 'sessions']);
  const peak = cols.reduce<(typeof cols)[number] | null>((a, c) => ((c.values.dau ?? 0) > (a?.values.dau ?? 0) ? c : a), null);
  const todayDau = cols.at(-1)?.values.dau;
  const maxToday = Math.max(0, ...t.top.map(r => r.hours));

  return (
    <AnalyticsFrame
      tab="overview"
      period={p.key}
      kpis={[
        {
          label: 'Daily readers (DAU)',
          value: avgDau == null ? dash : count(avgDau),
          delta: change(dau?.total, dau?.previous),
          sub: avgDau == null ? 'No reading yet' : 'vs previous period',
          explain: `Average readers a day over ${p.label}, WAT. ${READING}`,
        },
        {
          label: 'Monthly readers (MAU)',
          value: count(mau),
          sub: stickiness(avgDau, mau) ?? 'No reading yet',
          explain: `Readers with a session in the 30 days to the period's last day. ${READING}`,
        },
        {
          label: 'Reading hours',
          value: hours == null ? dash : num(hours),
          delta: change(hours, m.reading_hours?.previous),
          sub: perSession,
          explain: `Hours read over ${p.label}, from reading sessions, refreshed hourly.`,
        },
        {
          label: 'Books finished',
          value: finished == null ? dash : num(finished),
          delta: change(finished, m.books_finished?.previous),
          sub: finishedShare(finished, m.books_started?.total ?? null) ?? 'Share of books started',
          explain: `Books readers reached 95% of over ${p.label}, against books first opened for 30 seconds or more.`,
        },
      ]}
    >
      {error && (
        <div className="note warn">
          <span className="grow">
            <b>This chart is taking too long</b>Try a shorter period.
          </span>
        </div>
      )}
      <div className="split split--wide">
        <div className="stack s20">
          <Columns
            title={p.key === 'year' ? 'Daily readers, this year' : `Daily readers, last ${p.days} days`}
            buckets={cols}
            series={[
              { key: 'dau', label: 'Readers' },
              { key: 'reading_hours', label: 'Hours', hours: true },
              { key: 'sessions', label: 'Sessions' },
            ]}
            legend={{
              dau: (
                <>
                  <span>
                    <i />
                    Readers per day
                  </span>
                  <span>
                    <i className="n" />
                    Today: {count(todayDau, true)}
                  </span>
                  {peak && <span>{`Peak: ${peak.label}, ${count(peak.values.dau, true)}`}</span>}
                </>
              ),
              reading_hours: (
                <span>
                  <i />
                  Reading hours per day
                </span>
              ),
              sessions: (
                <span>
                  <i />
                  Reading sessions per day
                </span>
              ),
            }}
            empty={READING}
          />
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Top books by reading time</h2>
            </div>
            {b.top.length === 0 ? (
              <NoData why="Books show here once readers spend time in them or unlock them." />
            ) : (
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th className="r">Readers</th>
                      <th className="r">Reading time</th>
                      <th className="r">Unlocks</th>
                      <th className="r">Finished</th>
                      <th className="r">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.top.map((r, i) => (
                      <tr key={r.id}>
                        <td>
                          <div className="who">
                            <span className={`cv ${COVERS[i % COVERS.length]} x32`} />
                            <span>
                              <b>{r.title}</b>
                              <small>{r.genre ? `${r.author} · ${r.genre}` : r.author}</small>
                            </span>
                          </div>
                        </td>
                        <td className="n">{count(r.readers, true)}</td>
                        <td className="n">{r.hours > 0 ? `${num(r.hours)} h` : dash}</td>
                        <td className="n">{count(r.unlocks)}</td>
                        <td className="n">{share(r.finished_pct) ?? dash}</td>
                        <td className="n">{r.rating == null ? dash : r.rating.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="stack s20">
          <div className="panel">
            <div className="panel__head">
              <h2>Most read today</h2>
              <span className="sub">Hours so far</span>
            </div>
            {maxToday === 0 ? (
              <NoData why="Counts reading since midnight WAT." />
            ) : (
              <Hbars
                rows={t.top
                  .filter(r => r.hours > 0)
                  .map(r => ({ label: r.title, share: (100 * r.hours) / maxToday, value: `${num(r.hours)} h` }))}
              />
            )}
          </div>
          <details className="fold">
            <summary>
              Genre share and preview to unlock <small>{p.label.replace('the ', '')}</small>
            </summary>
            <div className="fold__b">
              <b>Genre share of reading time</b>
              {b.genres.length === 0 ? (
                <NoData why={READING} />
              ) : (
                <Hbars
                  rows={b.genres.map(g => ({
                    label: g.genre,
                    share: (100 * g.share) / b.genres[0]!.share,
                    value: `${Math.round(g.share)}%`,
                  }))}
                />
              )}
              {preview?.share == null ? (
                <>
                  <b>Preview to unlock</b>
                  <NoData why="Readers who reach the end of a free preview, and how many unlock the book. Shown from 5 readers." />
                </>
              ) : (
                <>
                  <b>{`Preview to unlock: ${share(preview.share)} unlocked a book after the free preview`}</b>
                  <Hbars
                    rows={preview.bands.map(g => ({
                      label: g.label,
                      share: g.share ? (100 * g.share) / Math.max(...preview.bands.map(x => x.share ?? 0)) : 0,
                      value: share(g.share) ?? 'Fewer than 5',
                      muted: g.share == null,
                    }))}
                  />
                </>
              )}
            </div>
          </details>
        </div>
      </div>
    </AnalyticsFrame>
  );
}
