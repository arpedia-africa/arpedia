import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { creditsToNaira } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';
import { BookHead } from '../book-head';
import { ToastButton } from '../book-menu';

const n0 = (n: number) => n.toLocaleString('en-NG');
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
const v = (share: number) => ({ '--v': `${Math.max(0, Math.min(100, share))}%` }) as CSSProperties;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Stats {
  readers: number;
  finished: number;
  finished_preview: number;
  per_day: { day: string; readers: number }[];
  reach: { no: number; title: string; readers: number }[];
  unlocks_upfront: number;
  unlocks_paygo: number;
  avg_paid: number | null;
  avg_paygo_credits: number | null;
  credits_spent: number;
  tips: number;
  author_earning_kobo: number;
  months: { month: string; credits: number | null; earning_kobo: number }[];
  month_open_from: string;
  rating: { avg: number; count: number } | null;
}

/** Up to 6 chapter rows, spread evenly from the first to the last chapter. */
function sample<T>(rows: T[], n = 6): T[] {
  if (rows.length <= n) return rows;
  return Array.from({ length: n }, (_, i) => rows[Math.round((i * (rows.length - 1)) / (n - 1))]!);
}

/**
 * Book stats (s-book-stats, flow 03 admin rule 3): readers, drop-off by chapter, unlocks upfront vs
 * pay as you read, and author earnings, all from reading_progress and credit_ledger.
 */
export default async function BookStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const [{ data: book }, { data }, { data: eff }] = await Promise.all([
    supabase.from('books').select('id, title, status').eq('id', id).maybeSingle(),
    supabase.rpc('admin_book_stats', { p_book: id }),
    supabase.from('book_effective').select('effective_price').eq('book_id', id).maybeSingle(),
  ]);
  if (!book || !data) notFound();
  const s = data as unknown as Stats;
  const price = eff?.effective_price ?? 0;
  const unlocks = s.unlocks_upfront + s.unlocks_paygo;
  const peak = Math.max(1, ...s.per_day.map(d => d.readers));
  const reach = sample(s.reach);
  const first = s.reach[0]?.readers ?? 0;

  return (
    <section className="screen enter">
      <BookHead
        bookId={id}
        title={book.title}
        tab="stats"
        live={book.status === 'live'}
        meta={[
          `${n0(s.readers)} reader${s.readers === 1 ? '' : 's'}`,
          `${n0(unlocks)} unlock${unlocks === 1 ? '' : 's'}`,
          `${pct(s.finished, s.readers)}% finish it`,
          s.rating?.count ? `${Number(s.rating.avg).toFixed(1)} from ${n0(s.rating.count)} reviews` : 'No reviews yet',
        ]}
        action={
          <ToastButton
            className="btn btn-p"
            label="Open in app preview"
            message={`Open ${book.title} in the Arpedia app to preview it as a reader.`}
          />
        }
      />
      <div className="page">
        <div className="ct-two">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Readers per day</h2>
                <span className="sub">Last 14 days</span>
              </div>
              <div className="panel__body">
                <div className="chart">
                  <div className="cols">
                    {s.per_day.map((d, i) => (
                      <div key={d.day} className={i === s.per_day.length - 1 ? 'col now' : 'col'}>
                        <i style={v((d.readers / peak) * 100)} title={`${n0(d.readers)} readers`}></i>
                      </div>
                    ))}
                  </div>
                  <div className="axis">
                    {s.per_day.map((d, i) => (
                      <span key={d.day}>{i === s.per_day.length - 1 ? 'Today' : Number(d.day.slice(8, 10))}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Preview to unlock</h2>
              </div>
              <div className="panel__body">
                <div className="funnel">
                  {[
                    ['Opened the book', s.readers],
                    ['Finished the preview', s.finished_preview],
                    ['Unlocked', unlocks],
                  ].map(([label, n]) => (
                    <div key={label} className="fn">
                      <span>{label}</span>
                      <span>
                        <div className="bar" style={v(pct(Number(n), s.readers))}></div>
                      </span>
                      <b>{n0(Number(n))}</b>
                      <small>{`${pct(Number(n), s.readers)}%`}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Where readers stop</h2>
                <span className="sub">Share reaching each chapter</span>
              </div>
              <div className="panel__body">
                {first > 0 ? (
                  <div className="hbars">
                    {reach.map(r => (
                      <div key={r.no} className="hb">
                        <span>{`Ch ${r.no}: ${r.title}`}</span>
                        <span className="track">
                          <i style={v(pct(r.readers, first))}></i>
                        </span>
                        <b>{`${pct(r.readers, first)}%`}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <b>No readers yet</b>
                    <span>Drop-off by chapter shows once people start reading.</span>
                  </div>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Unlocks and earnings</h2>
                <span className="sub">{`${n0(price)} credits (₦${n0(creditsToNaira(price))})`}</span>
              </div>
              <div className="panel__body">
                <div className="hbars">
                  <div className="hb">
                    <span>{`Paid upfront · ${n0(s.unlocks_upfront)}`}</span>
                    <span className="track">
                      <i style={v(pct(s.unlocks_upfront, unlocks))}></i>
                    </span>
                    <b>{`${pct(s.unlocks_upfront, unlocks)}%`}</b>
                  </div>
                  <div className="hb">
                    <span>{`Pay as you read · ${n0(s.unlocks_paygo)}`}</span>
                    <span className="track">
                      <i style={v(pct(s.unlocks_paygo, unlocks))}></i>
                    </span>
                    <b>{`${pct(s.unlocks_paygo, unlocks)}%`}</b>
                  </div>
                </div>
                <div className="kv-row">
                  <span>Average paid per reader</span>
                  <b>
                    {s.avg_paid != null ? `${n0(s.avg_paid)} credits (₦${n0(creditsToNaira(s.avg_paid))})` : 'None yet'}
                  </b>
                </div>
                <div className="kv-row">
                  <span>Pay as you read readers, average so far</span>
                  <b>{s.avg_paygo_credits != null ? `${n0(s.avg_paygo_credits)} credits` : 'None yet'}</b>
                </div>
                <div className="kv-row total">
                  <span>Author earnings to date</span>
                  <b>{`₦${n0(Math.round(s.author_earning_kobo / 100))}`}</b>
                </div>
              </div>
            </div>
          </div>
        </div>
        <details className="fold">
          <summary>
            More details <small>earnings by month</small>
          </summary>
          <div className="fold__b">
            <b>Earnings by month</b>
            {s.months.length ? (
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="r">Credits spent</th>
                      <th className="r">Earnings</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.months.map(m => (
                      <tr key={m.month}>
                        <td>{`${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)}`}</td>
                        <td className="n">{n0(m.credits ?? 0)}</td>
                        <td className="n">{`₦${n0(Math.round(m.earning_kobo / 100))}`}</td>
                        <td>{m.month >= s.month_open_from ? <span className="st st-info">Open</span> : 'Closed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <span className="muted">No credits spent on this book in the last 6 months.</span>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}
