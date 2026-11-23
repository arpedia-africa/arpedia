import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { dash, metrics, num } from '../data';
import { period } from '../period';
import { AnalyticsFrame, NoData } from '../shared';

export const metadata: Metadata = { title: 'Analytics: Reading · Arpedia Admin' };

const SESSIONS = 'Reading sessions start with the Reading flow; offline sessions count once the phone reconnects.';

/** s-analytics-reading: when and how readers read, how far they get, highlights, discussions and rooms. */
export default async function ReadingPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const p = period((await searchParams).p);
  const staff = await requireStaff();
  if (!staff.permissions.includes('view_analytics'))
    return <NoAccess page="analytics" label="Analytics" role={staff.role} />;
  const { data: m } = await metrics(['hour_hours'], p);

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
          value: dash,
          sub: 'vs previous period',
          explain: `Standard pages (250 words) turned per reading session. ${SESSIONS}`,
        },
        {
          label: 'Offline reading share',
          value: dash,
          sub: 'of reading hours',
          explain: `Hours read without a connection. ${SESSIONS}`,
        },
        {
          label: 'Highlights made',
          value: dash,
          sub: 'per finished book',
          explain: 'Highlights readers saved in the period, counted with the Reading flow.',
        },
        {
          label: 'Paragraph discussions',
          value: dash,
          sub: 'readers who took part',
          explain: 'Comments on paragraphs in the period, counted with the Reading flow.',
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
            <NoData why="Reading progress per book starts with the Reading flow." />
          </div>
        </div>
      </div>
      <details className="fold">
        <summary>
          Highlights, discussions and reading rooms <small>by book, top paragraphs, attendance</small>
        </summary>
        <div className="fold__b">
          <b>Highlights and discussions per book</b>
          <NoData why="Highlights and paragraph comments start with the Reading flow." />
          <b>Most discussed paragraphs</b>
          <NoData why="Shows the paragraphs readers talk about most, with the book and chapter." />
          <b>Reading rooms attendance</b>
          <NoData why="Starts when reading rooms go live." />
        </div>
      </details>
    </AnalyticsFrame>
  );
}
