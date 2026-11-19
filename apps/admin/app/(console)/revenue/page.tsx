import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AUTHOR_RATE, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { Empty, PLATFORM, guard, n0, planName, thisMonth } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Revenue · Arpedia Admin' };

const HOUR = 3_600_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** First instant of a Lagos month (month may be out of range; Date.UTC rolls the year). */
const monthStart = (year: number, month: number) => Date.UTC(year, month, 1) - HOUR;

type Period = 'month' | 'last' | 'quarter' | 'year';
const PERIODS: [Period, string][] = [
  ['month', 'This month'],
  ['last', 'Last month'],
  ['quarter', 'Quarter'],
  ['year', 'Year'],
];

/** The period asked for, and the one before it (for the "+11.4% on …" line), in Lagos time. */
function range(period: Period, now: number) {
  const l = new Date(now + HOUR);
  const y = l.getUTCFullYear();
  const m = l.getUTCMonth();
  const spanMonths = period === 'quarter' ? 3 : period === 'year' ? 12 : 1;
  const firstMonth = period === 'quarter' ? m - (m % 3) : period === 'year' ? 0 : period === 'last' ? m - 1 : m;
  const start = monthStart(y, firstMonth);
  const full = monthStart(y, firstMonth + spanMonths);
  const end = period === 'last' ? full : Math.min(now, full);
  const prevStart = monthStart(y, firstMonth - spanMonths);
  const prevEnd = period === 'last' ? start : Math.min(prevStart + (end - start), start);
  const text = (from: number, to: number) => {
    const a = new Date(from + HOUR);
    const b = new Date(to - 1 + HOUR);
    const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
    if (sameMonth) return `${a.getUTCDate()} to ${b.getUTCDate()} ${LONG[b.getUTCMonth()]}`;
    return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()} to ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  };
  return { start, end, prevStart, prevEnd, label: text(start, end), prevLabel: text(prevStart, prevEnd) };
}

/** What admin_revenue_summary returns (money in kobo, credits as counts). */
interface Summary {
  totals: {
    gross_kobo: number;
    fee_kobo: number;
    refunded_kobo: number;
    refund_count: number;
    net_kobo: number;
    sales: number;
    credits_plans: number;
    credits_topups: number;
  };
  by_product: { kind: string; plan_code: string | null; web: boolean; units: number; gross_kobo: number; fee_kobo: number }[];
  by_store: { store: string; gross_kobo: number; fee_kobo: number }[];
  by_month: { month: string; plan_kobo: number; topup_kobo: number; net_kobo: number }[];
  daily: { day: string; plan_kobo: number; topup_kobo: number }[];
  mrr: { plan_code: string; name: string; months: number; subs: number; mrr_kobo: number; per_month_kobo: number }[];
  credits: { spent: number; expired: number };
  unspent: number;
  deferred_kobo: number;
  cancelled_running: number;
  at_risk: number;
}

const compact = (kobo: number) => {
  const v = kobo / 100;
  return v >= 1_000_000 ? `₦${(v / 1_000_000).toFixed(1)}M` : naira(kobo);
};

/**
 * Revenue (s-revenue): credits sold and spent, unspent credits (deferred revenue), net revenue, by
 * product and platform, MRR (rule 35). Figures are sales as they happen, not cash received.
 */
export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const { denied } = await guard('revenue', 'Revenue');
  if (denied) return denied;

  const period = PERIODS.find(p => p[0] === sp.period)?.[0] ?? 'month';
  const now = Date.now();
  const r = range(period, now);
  const supabase = await serverSupabase();
  const iso = (ms: number) => new Date(ms).toISOString();
  const thisMo = thisMonth();

  // The period itself, the period before it (for the change), and "right now" for the 14-day chart,
  // the months and MRR (the same call when the period is this month).
  const summary = (from: number, to: number) => supabase.rpc('admin_revenue_summary', { p_from: iso(from), p_to: iso(to) });
  const [cur, prev, live] = await Promise.all([
    summary(r.start, r.end),
    summary(r.prevStart, r.prevEnd),
    period === 'month' ? null : summary(Date.parse(thisMo.iso), now),
  ]);
  if (cur.error) throw cur.error;
  if (prev.error) throw prev.error;
  if (live?.error) throw live.error;
  const s = cur.data as unknown as Summary;
  const p = prev.data as unknown as Summary;
  const lv = (live ? live.data : cur.data) as unknown as Summary;

  const t = s.totals;
  const netNow = t.net_kobo;
  const netPrev = p.totals.net_kobo;
  const change = netPrev > 0 ? ((netNow - netPrev) / netPrev) * 100 : null;
  const spent = s.credits.spent;
  const toAuthors = Math.round(spent * AUTHOR_RATE * 100);

  // Net revenue for the last 14 days, subscriptions under top-ups.
  const perDay = lv.daily;
  const peak = Math.max(1, ...perDay.map(x => x.plan_kobo + x.topup_kobo));
  const monthNet = lv.by_month.at(-1)?.net_kobo ?? 0;
  const avgDay = monthNet / Math.max(1, new Date(now + HOUR).getUTCDate());
  const dayLabel = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

  const plans = lv.mrr;
  const products = [
    ...plans.flatMap(pl => [false, true].map(web => ({ key: `${pl.plan_code}:${web}`, kind: 'plan', code: pl.plan_code as string | null, web, title: pl.name }))),
    ...[false, true].map(web => ({ key: `topup:${web}`, kind: 'topup', code: null as string | null, web, title: 'Top-ups' })),
  ]
    .map(pr => {
      const row = s.by_product.find(x => x.kind === pr.kind && x.plan_code === pr.code && x.web === pr.web);
      return { ...pr, sub: pr.web ? 'Web' : 'In-app', units: row?.units ?? 0, gross: row?.gross_kobo ?? 0, fees: row?.fee_kobo ?? 0 };
    })
    .filter(pr => pr.units > 0);

  const monthLabel = (m: string) => LONG[Number(m.slice(5, 7)) - 1]!;
  const platforms = (['play', 'app_store', 'web'] as const).map(st => {
    const row = s.by_store.find(x => x.store === st);
    return { st, gross: row?.gross_kobo ?? 0, fees: row?.fee_kobo ?? 0 };
  });

  const subscribers = lv.mrr.reduce((n, x) => n + x.subs, 0);
  const mrr = lv.mrr.reduce((n, x) => n + x.mrr_kobo, 0);

  const href = (pe: Period) => (pe === 'month' ? '/revenue' : `/revenue?period=${pe}`);
  const empty = t.sales === 0;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Revenue</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/royalties">
              Author earnings
            </Link>
            <Link className="ib" href="/exports" aria-label="Export revenue">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="toolbar">
          <div className="seg">
            {PERIODS.map(([key, label]) => (
              <Link key={key} href={href(key)} aria-selected={key === period} className={key === period ? 'is-selected' : undefined}>
                {label}
              </Link>
            ))}
          </div>
          <span className="muted">
            {`${r.label} · net revenue ${naira(netNow)}`}
            {change !== null && (
              <>
                {' · '}
                <span className={change >= 0 ? 'ok-t' : 'err-t'}>
                  <b>{`${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`}</b>
                </span>
                {` on ${r.prevLabel}`}
              </>
            )}
          </span>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__l">Credits sold</span>
            <span className="kpi__v">{n0(t.credits_plans + t.credits_topups)}</span>
            <span className="kpi__d">{`Plans ${n0(t.credits_plans)} · top-ups ${n0(t.credits_topups)}`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Credits spent</span>
            <span className="kpi__v">{n0(spent)}</span>
            <span className="kpi__d">{`${naira(toAuthors)} to authors at ₦${AUTHOR_RATE.toFixed(2)}`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Unspent credits</span>
            <span className="kpi__v">{n0(s.unspent)}</span>
            <span className="kpi__d">{`Owed to readers · about ${compact(s.deferred_kobo)} deferred`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Expired credits</span>
            <span className="kpi__v">{n0(s.credits.expired)}</span>
            <span className="kpi__d">Over the rollover cap, this period</span>
          </div>
        </div>
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Net revenue, last 14 days</h2>
                <span className="sub">{perDay.length ? `${dayLabel(perDay[0]!.day)} to ${dayLabel(perDay.at(-1)!.day)}` : ''}</span>
              </div>
              <div className="panel__body">
                <div className="chart">
                  <div className="cols">
                    {perDay.map((x, i) => (
                      <div className={`col${i === perDay.length - 1 ? ' now' : ''}`} key={x.day} title={`${x.day}: ${naira(x.plan_kobo + x.topup_kobo)}`}>
                        <i className="t" style={{ '--v': `${(x.topup_kobo / peak) * 100}%` } as CSSProperties}></i>
                        <i style={{ '--v': `${(x.plan_kobo / peak) * 100}%` } as CSSProperties}></i>
                      </div>
                    ))}
                  </div>
                  <div className="axis">
                    {perDay.map(x => (
                      <span key={x.day}>{Number(x.day.slice(8))}</span>
                    ))}
                  </div>
                  <div className="legend">
                    <span>
                      <i></i>Subscriptions
                    </span>
                    <span>
                      <i className="t"></i>Top-ups
                    </span>
                    <span>{`Average ${naira(Math.round(avgDay))} a day in ${thisMo.name}`}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>By product</h2>
              </div>
              {empty ? (
                <Empty title="No sales in this period" text="Plans and top-ups show here as readers buy them." />
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="r">Units</th>
                        <th className="r">Gross</th>
                        <th className="r">Fees</th>
                        <th className="r">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(pr => (
                        <tr key={pr.key}>
                          <td>
                            <div className="who">
                              <span>
                                <b>{pr.title}</b>
                                <small>{pr.sub}</small>
                              </span>
                            </div>
                          </td>
                          <td className="n">{n0(pr.units)}</td>
                          <td className="n">{naira(pr.gross)}</td>
                          <td className="n">{naira(pr.fees)}</td>
                          <td className="n">{naira(pr.gross - pr.fees)}</td>
                        </tr>
                      ))}
                      <tr className="mn-sub">
                        <td>Total before refunds</td>
                        <td className="n">{n0(t.sales)}</td>
                        <td className="n">{naira(t.gross_kobo)}</td>
                        <td className="n">{naira(t.fee_kobo)}</td>
                        <td className="n">{naira(t.gross_kobo - t.fee_kobo)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Breakdown</h2>
                <span className="sub">{r.label}</span>
              </div>
              <div className="panel__body">
                <div className="kv-row">
                  <span>Gross sales</span>
                  <b>{naira(t.gross_kobo)}</b>
                </div>
                <div className="kv-row">
                  <span>{`Store fees (${t.gross_kobo ? ((t.fee_kobo / t.gross_kobo) * 100).toFixed(1) : '0'}%)`}</span>
                  <b>{`−${naira(t.fee_kobo)}`}</b>
                </div>
                <div className="kv-row">
                  <span>{`Refunds (${n0(t.refund_count)})`}</span>
                  <b>{`−${naira(t.refunded_kobo)}`}</b>
                </div>
                <div className="kv-row total">
                  <span>Net revenue</span>
                  <b>{naira(netNow)}</b>
                </div>
                <div className="kv-row">
                  <span>{`Author earnings (${n0(spent)} credits × ₦${AUTHOR_RATE.toFixed(2)})`}</span>
                  <b>{naira(toAuthors)}</b>
                </div>
                <div className="kv-row">
                  <span>Arpedia after author earnings</span>
                  <b>{naira(netNow - toAuthors)}</b>
                </div>
                <div className="kv-row">
                  <span>{`Subscribers (${lv.mrr.map(x => `${x.name} ${n0(x.subs)}`).join(' · ')})`}</span>
                  <b>{n0(subscribers)}</b>
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                More details <small>by month, by platform, subscribers</small>
              </summary>
              <div className="fold__b">
                <span className="mn-fold-h">Net revenue by month</span>
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="r">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lv.by_month.map((m, i) => (
                        <tr key={m.month}>
                          <td>
                            {i === lv.by_month.length - 1 ? `${monthLabel(m.month)} so far` : monthLabel(m.month)}
                            {i === lv.by_month.length - 2 && m.net_kobo > 0 && (
                              <>
                                {' '}
                                <span className="muted">{`subscriptions ${naira(m.plan_kobo)}, top-ups ${naira(m.topup_kobo)}`}</span>
                              </>
                            )}
                          </td>
                          <td className="n">{naira(m.net_kobo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <span className="mn-fold-h">By platform</span>
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th className="r">Fee</th>
                        <th className="r">Gross</th>
                        <th className="r">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platforms.map(pf => (
                        <tr key={pf.st}>
                          <td>
                            <b>{PLATFORM[pf.st]}</b>
                            {t.gross_kobo > 0 && <span className="muted">{` ${Math.round((pf.gross / t.gross_kobo) * 100)}%`}</span>}
                          </td>
                          <td className="n">{pf.gross ? `${((pf.fees / pf.gross) * 100).toFixed(1).replace(/\.0$/, '')}%` : '—'}</td>
                          <td className="n">{naira(pf.gross)}</td>
                          <td className="n">{naira(pf.gross - pf.fees)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <span className="mn-fold-h">Subscriber health</span>
                <div>
                  <div className="kv-row">
                    <span>MRR, before fees</span>
                    <b>{naira(mrr)}</b>
                  </div>
                  <div className="kv-row">
                    <span>ARPU per subscriber per month</span>
                    <b>{subscribers ? naira(Math.round(mrr / subscribers)) : '—'}</b>
                  </div>
                  <div className="kv-row">
                    <span>Cancelled, still running to the end of the period</span>
                    <b>{n0(lv.cancelled_running)}</b>
                  </div>
                  <div className="kv-row">
                    <span>In grace period or billing retry</span>
                    <b>{n0(lv.at_risk)}</b>
                  </div>
                </div>
                <span className="mn-fold-h">MRR by plan</span>
                {mrr > 0 ? (
                  <div className="hbars">
                    {lv.mrr.map(x => (
                      <div className="hb" key={x.plan_code}>
                        <span>{`${planName(x.plan_code)} · ${n0(x.subs)} · ${naira(x.per_month_kobo)} a month`}</span>
                        <span className="track">
                          <i style={{ '--v': `${(x.mrr_kobo / mrr) * 100}%` } as CSSProperties}></i>
                        </span>
                        <b>{naira(x.mrr_kobo)}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted">No active subscribers yet.</span>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
