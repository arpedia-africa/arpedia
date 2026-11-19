import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AUTHOR_RATE, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { Empty, PLATFORM, guard, n0, planName, thisMonth } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Revenue · Arpedia Admin' };

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Lagos calendar day of an instant, YYYY-MM-DD. */
const lagosDay = (ms: number) => new Date(ms + HOUR).toISOString().slice(0, 10);
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

interface Tx {
  kind: string;
  plan_code: string | null;
  store: string;
  status: string;
  gross_kobo: number;
  fee_kobo: number;
  refunded_kobo: number;
  credits_granted: number;
  created_at: string;
}

/** Money in, kept as kobo. A pending or failed payment is not a sale. */
const sale = (t: Tx) => t.status === 'succeeded' || t.status === 'refunded' || t.status === 'disputed';
const net = (t: Tx) => t.gross_kobo - t.fee_kobo - t.refunded_kobo;
const sum = (list: Tx[], f: (t: Tx) => number) => list.reduce((n, t) => n + f(t), 0);
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
  const l = new Date(now + HOUR);
  const sevenBack = monthStart(l.getUTCFullYear(), l.getUTCMonth() - 6);
  const since = Math.min(sevenBack, r.prevStart, now - 14 * DAY);

  // One pass over every payment since the earliest date any panel needs.
  const txns: Tx[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase
      .from('transactions')
      .select('kind, plan_code, store, status, gross_kobo, fee_kobo, refunded_kobo, credits_granted, created_at')
      .gte('created_at', new Date(since).toISOString())
      .order('created_at')
      .range(from, from + 999);
    if (error) throw error;
    txns.push(...data);
    if (data.length < 1000) break;
  }

  const activeCount = (plan: 'monthly' | 'quarterly' | 'yearly', web: boolean) => {
    const q = supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('plan_code', plan);
    return web ? q.eq('store', 'web') : q.neq('store', 'web');
  };
  const [snaps, plans, topups, ...active] = await Promise.all([
    supabase
      .from('credit_daily_snapshot')
      .select('day, issued, spent, expired, unspent_total')
      .gte('day', lagosDay(r.start))
      .order('day', { ascending: false }),
    supabase.from('plans').select('code, name, months, credits, bonus_credits, price_play_kobo, price_web_kobo').order('sort'),
    supabase.from('topup_products').select('credits').order('credits'),
    ...(['monthly', 'quarterly', 'yearly'] as const).flatMap(p => [activeCount(p, false), activeCount(p, true)]),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['grace', 'billing_retry']),
  ]);
  if (snaps.error) throw snaps.error;
  const latest = await supabase.from('credit_daily_snapshot').select('unspent_total').order('day', { ascending: false }).limit(1).maybeSingle();

  const inRange = (t: Tx, from: number, to: number) => {
    const at = new Date(t.created_at).getTime();
    return sale(t) && at >= from && at < to;
  };
  const cur = txns.filter(t => inRange(t, r.start, r.end));
  const prev = txns.filter(t => inRange(t, r.prevStart, r.prevEnd));
  const gross = sum(cur, t => t.gross_kobo);
  const fees = sum(cur, t => t.fee_kobo);
  const refunded = sum(cur, t => t.refunded_kobo);
  const refundCount = cur.filter(t => t.refunded_kobo > 0).length;
  const netNow = gross - fees - refunded;
  const netPrev = sum(prev, net);
  const change = netPrev > 0 ? ((netNow - netPrev) / netPrev) * 100 : null;

  const credits = (kind: string) => sum(cur.filter(t => t.kind === kind), t => t.credits_granted);
  const spent = snaps.data.reduce((n, s) => n + s.spent, 0);
  const expired = snaps.data.reduce((n, s) => n + s.expired, 0);
  const unspent = Number(latest.data?.unspent_total ?? 0);
  const toAuthors = Math.round(spent * AUTHOR_RATE * 100);

  // Net revenue for the last 14 days, subscriptions under top-ups.
  const days = Array.from({ length: 14 }, (_, i) => lagosDay(now - (13 - i) * DAY));
  const perDay = days.map(d => {
    const ofDay = txns.filter(t => sale(t) && lagosDay(new Date(t.created_at).getTime()) === d);
    return { d, plan: sum(ofDay.filter(t => t.kind === 'plan'), net), topup: sum(ofDay.filter(t => t.kind === 'topup'), net) };
  });
  const peak = Math.max(1, ...perDay.map(x => x.plan + x.topup));
  const thisMo = thisMonth();
  const monthNet = sum(txns.filter(t => inRange(t, Date.parse(thisMo.iso), now)), net);
  const avgDay = monthNet / Math.max(1, new Date(now + HOUR).getUTCDate());

  // By product: plan or top-up, in-app or web.
  const planRows = plans.data ?? [];
  const products = [
    ...planRows.flatMap(p => [false, true].map(web => ({ key: `${p.code}:${web}`, title: p.name, sub: `${web ? 'Web' : 'In-app'} · ${n0(p.credits + p.bonus_credits)} credits`, kind: 'plan', code: p.code as string | null, web }))),
    ...[false, true].map(web => ({
      key: `topup:${web}`,
      title: 'Top-ups',
      sub: `${web ? 'Web' : 'In-app'} · ${(topups.data ?? []).map(t => n0(t.credits)).join(', ')} credits`,
      kind: 'topup',
      code: null as string | null,
      web,
    })),
  ].map(p => {
    const list = cur.filter(t => t.kind === p.kind && t.plan_code === p.code && (t.store === 'web') === p.web);
    return { ...p, units: list.length, gross: sum(list, t => t.gross_kobo), fees: sum(list, t => t.fee_kobo) };
  });

  const byMonth = Array.from({ length: 7 }, (_, i) => {
    const a = monthStart(l.getUTCFullYear(), l.getUTCMonth() - 6 + i);
    const b = monthStart(l.getUTCFullYear(), l.getUTCMonth() - 5 + i);
    const list = txns.filter(t => inRange(t, a, Math.min(b, now)));
    const d = new Date(a + HOUR);
    return {
      name: LONG[d.getUTCMonth()]!,
      last: i === 5,
      current: i === 6,
      plan: sum(list.filter(t => t.kind === 'plan'), net),
      topup: sum(list.filter(t => t.kind === 'topup'), net),
      net: sum(list, net),
    };
  });

  const platforms = (['play', 'app_store', 'web'] as const).map(s => {
    const list = cur.filter(t => t.store === s);
    return { s, gross: sum(list, t => t.gross_kobo), net: sum(list, t => t.gross_kobo - t.fee_kobo), fees: sum(list, t => t.fee_kobo) };
  });

  // Monthly recurring revenue before fees: every active subscriber at their per-month price.
  const perMonth = (p: (typeof planRows)[number], web: boolean) => (web ? p.price_web_kobo : p.price_play_kobo) / p.months;
  const mrrRows = planRows.map((p, i) => {
    const inApp = active[i * 2]?.count ?? 0;
    const web = active[i * 2 + 1]?.count ?? 0;
    return { p, subs: inApp + web, mrr: Math.round(inApp * perMonth(p, false) + web * perMonth(p, true)) };
  });
  const subscribers = mrrRows.reduce((n, x) => n + x.subs, 0);
  const mrr = mrrRows.reduce((n, x) => n + x.mrr, 0);
  const waitingToEnd = active[6]?.count ?? 0;
  const atRisk = active[7]?.count ?? 0;

  const href = (p: Period) => (p === 'month' ? '/revenue' : `/revenue?period=${p}`);
  const empty = cur.length === 0;

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
            <span className="kpi__v">{n0(credits('plan') + credits('topup'))}</span>
            <span className="kpi__d">{`Plans ${n0(credits('plan'))} · top-ups ${n0(credits('topup'))}`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Credits spent</span>
            <span className="kpi__v">{n0(spent)}</span>
            <span className="kpi__d">{`${naira(toAuthors)} to authors at ₦${AUTHOR_RATE.toFixed(2)}`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Unspent credits</span>
            <span className="kpi__v">{n0(unspent)}</span>
            <span className="kpi__d">{`Owed to readers · about ${compact(unspent * 300)} deferred`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Expired credits</span>
            <span className="kpi__v">{n0(expired)}</span>
            <span className="kpi__d">Over the rollover cap, this period</span>
          </div>
        </div>
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Net revenue, last 14 days</h2>
                <span className="sub">{`${perDay[0]!.d.slice(8).replace(/^0/, '')} ${MONTHS[Number(perDay[0]!.d.slice(5, 7)) - 1]} to ${perDay[13]!.d.slice(8).replace(/^0/, '')} ${MONTHS[Number(perDay[13]!.d.slice(5, 7)) - 1]}`}</span>
              </div>
              <div className="panel__body">
                <div className="chart">
                  <div className="cols">
                    {perDay.map((x, i) => (
                      <div className={`col${i === 13 ? ' now' : ''}`} key={x.d} title={`${x.d}: ${naira(x.plan + x.topup)}`}>
                        <i className="t" style={{ '--v': `${(x.topup / peak) * 100}%` } as CSSProperties}></i>
                        <i style={{ '--v': `${(x.plan / peak) * 100}%` } as CSSProperties}></i>
                      </div>
                    ))}
                  </div>
                  <div className="axis">
                    {perDay.map(x => (
                      <span key={x.d}>{Number(x.d.slice(8))}</span>
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
                      {products
                        .filter(p => p.units > 0)
                        .map(p => (
                          <tr key={p.key}>
                            <td>
                              <div className="who">
                                <span>
                                  <b>{p.title}</b>
                                  <small>{p.sub}</small>
                                </span>
                              </div>
                            </td>
                            <td className="n">{n0(p.units)}</td>
                            <td className="n">{naira(p.gross)}</td>
                            <td className="n">{naira(p.fees)}</td>
                            <td className="n">{naira(p.gross - p.fees)}</td>
                          </tr>
                        ))}
                      <tr className="mn-sub">
                        <td>Total before refunds</td>
                        <td className="n">{n0(cur.length)}</td>
                        <td className="n">{naira(gross)}</td>
                        <td className="n">{naira(fees)}</td>
                        <td className="n">{naira(gross - fees)}</td>
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
                  <b>{naira(gross)}</b>
                </div>
                <div className="kv-row">
                  <span>{`Store fees (${gross ? ((fees / gross) * 100).toFixed(1) : '0'}%)`}</span>
                  <b>{`−${naira(fees)}`}</b>
                </div>
                <div className="kv-row">
                  <span>{`Refunds (${n0(refundCount)})`}</span>
                  <b>{`−${naira(refunded)}`}</b>
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
                  <span>{`Subscribers (${mrrRows.map(x => `${x.p.name} ${n0(x.subs)}`).join(' · ')})`}</span>
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
                      {byMonth.map(m => (
                        <tr key={m.name}>
                          <td>
                            {m.current ? `${m.name} so far` : m.name}
                            {m.last && m.net > 0 && (
                              <>
                                {' '}
                                <span className="muted">{`subscriptions ${naira(m.plan)}, top-ups ${naira(m.topup)}`}</span>
                              </>
                            )}
                          </td>
                          <td className="n">{naira(m.net)}</td>
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
                      {platforms.map(p => (
                        <tr key={p.s}>
                          <td>
                            <b>{PLATFORM[p.s]}</b>
                            {gross > 0 && <span className="muted">{` ${Math.round((p.gross / gross) * 100)}%`}</span>}
                          </td>
                          <td className="n">{p.gross ? `${((p.fees / p.gross) * 100).toFixed(1).replace(/\.0$/, '')}%` : '—'}</td>
                          <td className="n">{naira(p.gross)}</td>
                          <td className="n">{naira(p.net)}</td>
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
                    <b>{n0(waitingToEnd)}</b>
                  </div>
                  <div className="kv-row">
                    <span>In grace period or billing retry</span>
                    <b>{n0(atRisk)}</b>
                  </div>
                </div>
                <span className="mn-fold-h">MRR by plan</span>
                {mrr > 0 ? (
                  <div className="hbars">
                    {mrrRows.map(x => (
                      <div className="hb" key={x.p.code}>
                        <span>{`${planName(x.p.code)} · ${n0(x.subs)} · ${naira(Math.round(perMonth(x.p, false)))} a month`}</span>
                        <span className="track">
                          <i style={{ '--v': `${(x.mrr / mrr) * 100}%` } as CSSProperties}></i>
                        </span>
                        <b>{naira(x.mrr)}</b>
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
