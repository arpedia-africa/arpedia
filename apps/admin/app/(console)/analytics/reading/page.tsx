import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { count, dash, metrics, num } from '../data';
import { share } from '../overview';
import { period } from '../period';
import { AnalyticsFrame, NoData } from '../shared';
import { EMPTY, held, pagesDelta, paragraphHint, perFinished, tookPart, type Reading } from './reading';

export const metadata: Metadata = { title: 'Analytics: Reading · Arpedia Admin' };

const SESSIONS = 'Reading sessions start with the Reading flow; offline sessions count once the phone reconnects.';
const PAGES = 'Shown once the app sends pages and offline reading with each session.';
const COVERS = ['c1', 'c3', 'c5', 'c2', 'c7', 'c4', 'c6', 'c8'];

/** s-analytics-reading: when and how readers read, how far they get, highlights, discussions and rooms. */
export default async function ReadingPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const p = period((await searchParams).p);
  const staff = await requireStaff();
  if (!staff.permissions.includes('view_analytics'))
    return <NoAccess page="analytics" label="Analytics" role={staff.role} />;
  const supabase = await serverSupabase();
  const [{ data: m }, reading] = await Promise.all([
    metrics(['hour_hours'], p),
    supabase.rpc('staff_analytics_reading', { p_from: p.from, p_to: p.to }),
  ]);
  const r = (reading.data as unknown as Reading | null) ?? EMPTY;
  const k = r.kpis;
  const far = r.how_far;

  // Average reading hours per day for each WAT hour of the day.
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const r of m.hour_hours?.series ?? []) {
    const h = Number(r.dim.hour);
    if (h >= 0 && h < 24) byHour[h]! += (r.value ?? 0) / p.days;
  }
  const max = Math.max(...byHour);
  const total = byHour.reduce((a, x) => a + x, 0);
  const peak = byHour.indexOf(max);
  // The two-hour window with the most reading is the evening peak, drawn in night.
  let best = 0;
  for (let h = 1; h < 24; h++) if (byHour[h - 1]! + byHour[h]! > byHour[best]! + byHour[best + 1]!) best = h - 1;
  const late = (h: number) => h < 5;
  const pad = (h: number) => String(h).padStart(2, '0');

  return (
    <AnalyticsFrame
      tab="reading"
      period={p.key}
      kpis={[
        {
          label: 'Average pages per session',
          value: k.pages_per_session == null ? dash : num(k.pages_per_session),
          delta: pagesDelta(k.pages_per_session, k.pages_per_session_prev),
          sub: k.pages_per_session == null ? 'Not sent by the app yet' : 'vs previous period',
          explain: `Standard pages (250 words) turned per reading session of 30 seconds or more. ${PAGES}`,
        },
        {
          label: 'Offline reading share',
          value: share(k.offline_share) ?? dash,
          sub: k.offline_share == null ? 'Not sent by the app yet' : 'of reading hours',
          explain: `Hours read without a connection. ${PAGES} ${SESSIONS}`,
        },
        {
          label: 'Highlights made',
          value: num(k.highlights),
          sub: perFinished(k.highlights_per_finished) ?? 'in the period',
          explain: 'Highlights readers saved in the period (deleted ones not counted), over books finished in it. Shown per book from 5 finished books.',
        },
        {
          label: 'Paragraph discussions',
          value: num(k.discussions),
          sub: tookPart(k.discussion_readers) ?? (k.discussions ? 'Fewer than 5 readers took part' : 'in the period'),
          explain: 'Comments on paragraphs in the period, still visible. Readers who took part show from 5.',
        },
      ]}
    >
      <div className="split">
        <div className="panel">
          <div className="panel__head">
            <h2>Reading hours by hour of day</h2>
            <span className="sub">{`WAT, ${p.key === 'year' ? 'this year' : `${p.days} day`} average`}</span>
          </div>
          <div className="panel__body">
            {max === 0 ? (
              <NoData why={SESSIONS} />
            ) : (
              <div className="chart sy-hrs">
                <div className="cols">
                  {byHour.map((v, h) => (
                    <div key={h} className="col" title={`${pad(h)}:00 · ${v.toFixed(1)} h a day`}>
                      {v > 0 && (
                        <i
                          className={h === best || h === best + 1 ? 'n' : late(h) ? 't' : undefined}
                          style={{ '--v': `${((100 * v) / max).toFixed(1)}%` } as CSSProperties}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="axis">
                  {byHour.map((_, h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                <div className="legend">
                  <span>
                    <i className="n" />
                    {`Peak: ${pad(best)}:00 to ${pad(best + 1)}:59, ${Math.round((100 * (byHour[best]! + byHour[best + 1]!)) / total)}% of all reading`}
                  </span>
                  <span>
                    <i />
                    {`Busiest hour ${pad(peak)}:00, ${num(max)} h a day`}
                  </span>
                  <span>
                    <i className="t" />
                    Late night
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel__head">
            <h2>How far readers get</h2>
            <span className="sub">Of readers who unlocked a book</span>
          </div>
          <div className="panel__body">
            {far.bands == null ? (
              <NoData why="Furthest point of readers who unlocked a book and opened it in the period. Shown from 5 readers." />
            ) : (
              <>
                <div className="sy-dist">
                  {far.bands.map(b => (
                    <div key={b.label}>
                      <span className="tr">
                        <i style={{ '--v': `${b.share}%` } as CSSProperties} />
                      </span>
                      <b>{share(b.share)}</b>
                      <span>{b.label}</span>
                    </div>
                  ))}
                </div>
                {far.by_length.map(l => (
                  <div className="kv-row" key={l.label}>
                    <span>{`Average completion, ${l.label}`}</span>
                    <b title={l.avg == null ? 'Fewer than 5 readers' : undefined}>{share(l.avg) ?? dash}</b>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
      <details className="fold">
        <summary>
          Highlights, discussions and reading rooms <small>by book, top paragraphs, attendance</small>
        </summary>
        <div className="fold__b">
          <b>Highlights and discussions per book</b>
          {r.books.length === 0 ? (
            <NoData why="Highlights and paragraph comments made in the period." />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th className="r">Highlights</th>
                    <th className="r">Discussions</th>
                    <th className="r">Replies</th>
                    <th className="r">Offline</th>
                  </tr>
                </thead>
                <tbody>
                  {r.books.map((b, i) => (
                    <tr key={b.id}>
                      <td>
                        <div className="who">
                          <span className={`cv ${COVERS[i % COVERS.length]} x32`} />
                          <span>
                            <b>{b.title}</b>
                            <small>{b.author}</small>
                          </span>
                        </div>
                      </td>
                      <td className="n">{num(b.highlights)}</td>
                      <td className="n">{num(b.discussions)}</td>
                      <td className="n">{num(b.replies)}</td>
                      <td className="n">{share(b.offline) ?? dash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <b>Most discussed paragraphs</b>
          {r.paragraphs.length === 0 ? (
            <NoData why="Paragraphs 5 or more readers commented on in the period, with the book and chapter." />
          ) : (
            r.paragraphs.map((q, i) => (
              <div className="quote" key={`${q.book_id}-${i}`}>
                {q.quote ? (
                  <>
                    &ldquo;<mark>{q.quote}</mark>&rdquo;
                  </>
                ) : (
                  'A paragraph readers commented on without quoting it.'
                )}
                <div className="hint">
                  <b>{q.title}</b>, {paragraphHint(q)}
                </div>
              </div>
            ))
          )}
          <div>
            <b>
              {r.rooms.stayed_pct == null
                ? 'Reading rooms attendance'
                : `Reading rooms attendance (${share(r.rooms.stayed_pct)} stayed to the end)`}
            </b>
            <Link className="link" href="/community/rooms">
              All reading rooms
            </Link>
          </div>
          {r.rooms.rows.length === 0 ? (
            <NoData why="Reading rooms that started in the period." />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Held</th>
                    <th className="r">Joined</th>
                    <th className="r">Stayed to the end</th>
                    <th className="r">Messages</th>
                    <th className="r">Unlocks after</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rooms.rows.map(x => (
                    <tr key={x.id}>
                      <td>
                        <b>{x.name}</b>
                      </td>
                      <td className="nw">{held(x.held)}</td>
                      <td className="n">{count(x.joined, true)}</td>
                      <td className="n">{share(x.stayed_pct) ?? dash}</td>
                      <td className="n">{num(x.messages)}</td>
                      <td className="n">{count(x.unlocks, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </AnalyticsFrame>
  );
}
