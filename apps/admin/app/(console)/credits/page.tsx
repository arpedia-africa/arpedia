import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AUTHOR_RATE, ledgerDate, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { Empty, type Supa, dayMonth, guard, n0, thisMonth } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { ApprovalButtons, FreezeGifting } from './client';

export const metadata: Metadata = { title: 'Credits · Arpedia Admin' };

const ISSUED = ['plan_grant', 'top_up', 'promo', 'staff_adjust'] as const;
const SPENT = ['unlock_all', 'chapter', 'undo', 'tip', 'message', 'gift_out'] as const;

interface Row {
  id: number;
  reason: string;
  delta: number;
  book_id: string | null;
  user_id: string;
  actor_id: string | null;
  author_earning_kobo: number;
  created_at: string;
  meta: unknown;
}

/** Every ledger row of the month for these reasons, a thousand at a time (the API's page size). */
async function monthRows(supabase: Supa, since: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('id, reason, delta, book_id, user_id, actor_id, author_earning_kobo, created_at, meta')
      .in('reason', [...ISSUED, ...SPENT])
      .gte('created_at', since)
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const ALERT_TITLE: Record<string, (who: string) => string> = {
  gift_loop: who => `${who} is gifting credits in a loop`,
  transfers: who => `${who} sent many gifts in a short time`,
  chargeback: who => `${who} had a chargeback`,
  lapsed_topup: who => `${who} topped up after the plan lapsed`,
  reconcile: who => `${who}'s balance does not match the ledger`,
  duplicate_charge: who => `${who} was charged twice`,
  clawback_short: who => `A refund could not take back all of ${who}'s credits`,
};
const FARMING = new Set(['gift_loop', 'transfers']);

const bar = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** Credits (s-credits): the credit economy in one page, anomalies, and grants waiting for a second approver. */
export default async function CreditsPage() {
  const { staff, denied } = await guard('credits', 'Credits');
  if (denied) return denied;

  const supabase = await serverSupabase();
  const month = thisMonth();
  const [rows, snap, alerts, requests, config] = await Promise.all([
    monthRows(supabase, month.iso),
    supabase
      .from('credit_daily_snapshot')
      .select('day, expired, unspent_total, unspent_by_bucket')
      .order('day', { ascending: false })
      .limit(40),
    supabase
      .from('credit_alerts')
      .select('id, user_id, kind, detail, created_at, user:profiles!credit_alerts_user_id_fkey(full_name, username)')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('credit_grant_requests')
      .select(
        `id, user_id, credits, reason, requested_by, created_at,
         user:profiles!credit_grant_requests_user_id_fkey(full_name),
         asker:profiles!credit_grant_requests_requested_by_fkey(full_name)`,
      )
      .eq('status', 'pending')
      .order('created_at'),
    supabase.from('app_config').select('value').eq('key', 'gifting_frozen').maybeSingle(),
  ]);
  if (snap.error) throw snap.error;
  if (alerts.error) throw alerts.error;
  if (requests.error) throw requests.error;

  const frozen = config.data?.value === true;
  const latest = snap.data[0];
  const unspent = Number(latest?.unspent_total ?? 0);
  const rollover = Number((latest?.unspent_by_bucket as { rollover?: number } | null)?.rollover ?? 0);
  const expired = snap.data.filter(s => s.day >= month.day).reduce((n, s) => n + s.expired, 0);

  // Issued and spent, from the ledger rows of the month.
  const issuedRows = rows.filter(r => r.delta > 0 && (ISSUED as readonly string[]).includes(r.reason));
  const spentRows = rows.filter(r => (SPENT as readonly string[]).includes(r.reason));
  const sum = (list: Row[], reason: string) => list.filter(r => r.reason === reason).reduce((n, r) => n + r.delta, 0);
  const issued = issuedRows.reduce((n, r) => n + r.delta, 0);
  const spent = -spentRows.reduce((n, r) => n + r.delta, 0);
  const toAuthors = spentRows.reduce((n, r) => n + r.author_earning_kobo, 0);
  const bySpend = [
    ['Books, paid upfront', -sum(spentRows, 'unlock_all')],
    ['Books, pay as you read', -(sum(spentRows, 'chapter') + sum(spentRows, 'undo'))],
    ['Messages to authors', -sum(spentRows, 'message')],
    ['Gifts', -sum(spentRows, 'gift_out')],
    ['Tips', -sum(spentRows, 'tip')],
  ] as const;
  const plans = sum(issuedRows, 'plan_grant');
  const topups = sum(issuedRows, 'top_up');
  const grants = issuedRows.filter(r => r.reason === 'staff_adjust');
  const grantTotal = grants.reduce((n, r) => n + r.delta, 0);

  // Most unlocked books: credits paid net of returns, and how many readers paid.
  const books = new Map<string, { credits: number; readers: Set<string> }>();
  for (const r of spentRows) {
    if (!r.book_id || !['unlock_all', 'chapter', 'undo'].includes(r.reason)) continue;
    const b = books.get(r.book_id) ?? { credits: 0, readers: new Set<string>() };
    b.credits -= r.delta;
    if (r.delta < 0) b.readers.add(r.user_id);
    books.set(r.book_id, b);
  }
  const top = [...books.entries()].sort((a, b) => b[1].credits - a[1].credits).slice(0, 5);
  const topIds = top.map(t => t[0]);
  const { data: topBooks, error: topError } = topIds.length
    ? await supabase
        .from('books')
        .select('id, title, price_override_credits, current_revision_id, author:profiles!books_author_id_fkey(full_name)')
        .in('id', topIds)
    : { data: [], error: null };
  if (topError) throw topError;
  const revIds = (topBooks ?? []).flatMap(b => (b.current_revision_id ? [b.current_revision_id] : []));
  const { data: revs } = revIds.length
    ? await supabase.from('book_revisions').select('id, pages, price_credits').in('id', revIds)
    : { data: [] };

  // Names for the grants table.
  const people = [...new Set(grants.flatMap(g => [g.user_id, g.actor_id, (g.meta as { approved_by?: string } | null)?.approved_by ?? null]))].filter(
    (p): p is string => !!p,
  );
  const { data: names } = people.length
    ? await supabase.from('profiles').select('id, full_name').in('id', people)
    : { data: [] };
  const nameOf = (id: string | null | undefined) => (names ?? []).find(p => p.id === id)?.full_name || '—';
  const reasonOf = new Map<number, string>();
  if (grants.length) {
    const { data: notes } = await supabase
      .from('credit_ledger')
      .select('id, note')
      .in('id', grants.map(g => g.id));
    for (const n of notes ?? []) reasonOf.set(n.id, n.note ?? '');
  }
  const canApprove = staff.role === 'finance' || staff.role === 'super_admin';
  const pendingGrants = requests.data ?? [];

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Credits</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/users">
              Find a reader&apos;s ledger
            </Link>
            <Link className="ib" href="/exports" aria-label="Export ledger">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__l">Credits issued</span>
            <span className="kpi__v">{n0(issued)}</span>
            <span className="kpi__d">{`${month.label} · incl. ${n0(grantTotal)} staff grants`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Credits spent</span>
            <span className="kpi__v">{n0(spent)}</span>
            <span className="kpi__d">{`${naira(toAuthors)} to authors at ₦${AUTHOR_RATE.toFixed(2)}`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Unspent balance</span>
            <span className="kpi__v">{n0(unspent)}</span>
            <span className="kpi__d">{`Owed to readers · ${naira(unspent * 300)} at ₦3`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Expiring this month</span>
            <span className="kpi__v">{n0(rollover)}</span>
            <span className="kpi__d">{`Rolled over, ends at renewal · ${naira(rollover * 300)}`}</span>
          </div>
        </div>
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Where credits were spent</h2>
                <span className="sub">{`${n0(spent)} credits`}</span>
              </div>
              <div className="panel__body">
                {spent > 0 ? (
                  <div className="hbars">
                    {bySpend.map(([label, n]) => (
                      <div className="hb" key={label}>
                        <span>{label}</span>
                        <span className="track">
                          <i style={{ '--v': `${bar(n, spent)}%` } as CSSProperties}></i>
                        </span>
                        <b>{`${n0(n)} · ${bar(n, spent)}%`}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="No credits spent yet" text={`Spending shows here once readers unlock books in ${month.name}.`} />
                )}
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Most unlocked books</h2>
                <span className="sub">This month</span>
              </div>
              {top.length ? (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Book</th>
                        <th className="r">Price</th>
                        <th className="r">Readers</th>
                        <th className="r">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.map(([id, t], i) => {
                        const b = (topBooks ?? []).find(x => x.id === id);
                        const rev = (revs ?? []).find(r => r.id === b?.current_revision_id);
                        const price = b?.price_override_credits ?? rev?.price_credits;
                        return (
                          <tr key={id}>
                            <td>
                              <div className="who">
                                <span className={`cv c${[1, 3, 2, 4, 6][i]} x32`}></span>
                                <span>
                                  <b>{b?.title ?? 'A book'}</b>
                                  <small>
                                    {[b?.author?.full_name, rev?.pages ? `${n0(rev.pages)} pages` : ''].filter(Boolean).join(' · ')}
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td className="n">{price ? n0(price) : '—'}</td>
                            <td className="n">{n0(t.readers.size)}</td>
                            <td className="n">{n0(t.credits)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No unlocks yet this month" text="The books readers spend the most credits on show here." />
              )}
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Anomalies to check</h2>
                <span className="sub">{`${alerts.data.length} open`}</span>
              </div>
              {frozen && (
                <div className="li">
                  <span className="li__body">
                    <b>Gifting is frozen</b>
                    <small>Readers can still read and spend credits.</small>
                  </span>
                  <span className="li__trail">
                    <FreezeGifting frozen />
                  </span>
                </div>
              )}
              {alerts.data.length ? (
                <div className="list">
                  {alerts.data.map(a => {
                    const who = a.user?.full_name || (a.user?.username ? `@${a.user.username}` : 'A reader');
                    const d = (a.detail ?? {}) as { summary?: string; note?: string };
                    const title = (ALERT_TITLE[a.kind] ?? (w => `${w} needs a look`))(who);
                    const sub = [d.summary ?? d.note, `${dayMonth(a.created_at)}`].filter(Boolean).join(' · ');
                    const href = a.user_id ? `/credits/${a.user_id}` : '/credits';
                    return FARMING.has(a.kind) ? (
                      <div className="li mn-an" key={a.id}>
                        <Link className="li__body" href={href}>
                          <b>{title}</b>
                          <small>{sub}</small>
                        </Link>
                        <span className="li__trail">
                          <span className="st st-err">Likely farming</span>
                          {!frozen && <FreezeGifting frozen={false} />}
                        </span>
                      </div>
                    ) : (
                      <Link className="li" href={href} key={a.id}>
                        <span className="li__body">
                          <b>{title}</b>
                          <small>{sub}</small>
                        </span>
                        <span className="li__trail">
                          <Icon name="chev" />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Empty title="Nothing to check" text="Gift loops, many transfers in a short time and balance gaps show here." />
              )}
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Waiting for approval</h2>
                <span className="sub">{`${pendingGrants.length} grants over 500`}</span>
              </div>
              {pendingGrants.length ? (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Reader</th>
                        <th className="r">Credits</th>
                        <th>Reason</th>
                        <th>Asked by</th>
                        <th className="acts"></th>
                      </tr>
                    </thead>
                    <tbody className="mn-tr">
                      {pendingGrants.map(g => (
                        <tr key={g.id}>
                          <td>
                            <Link className="link" href={`/credits/${g.user_id}`}>
                              {g.user?.full_name || 'Reader'}
                            </Link>
                          </td>
                          <td className="n">{`+${n0(g.credits)}`}</td>
                          <td className="mn-wrap">{g.reason}</td>
                          <td>
                            {g.asker?.full_name || '—'}
                            <small className="faint">{` · ${dayMonth(g.created_at)}`}</small>
                          </td>
                          <td className="acts">
                            <ApprovalButtons
                              id={g.id}
                              canDecide={canApprove && g.requested_by !== staff.id}
                              why={
                                g.requested_by === staff.id
                                  ? 'You asked for this grant, so someone else has to approve it.'
                                  : 'Only Finance and Super admins can approve a grant.'
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Nothing waiting" text="Grants over 500 credits show here until a second approver decides." />
              )}
            </div>
            <details className="fold">
              <summary>
                More details <small>issued, staff grants, balances</small>
              </summary>
              <div className="fold__b">
                <div>
                  <div className="kv-row">
                    <span>Issued by plans</span>
                    <b>{n0(plans)}</b>
                  </div>
                  <div className="kv-row">
                    <span>Issued by top-ups</span>
                    <b>{n0(topups)}</b>
                  </div>
                  <div className="kv-row">
                    <span>{`Staff grants (${grants.length})`}</span>
                    <b>{n0(grantTotal)}</b>
                  </div>
                  <div className="kv-row">
                    <span>Issued minus spent, this month</span>
                    <b>{`${issued - spent >= 0 ? '+' : '−'}${n0(Math.abs(issued - spent))}`}</b>
                  </div>
                  <div className="kv-row">
                    <span>Credits in all balances</span>
                    <b>{n0(unspent)}</b>
                  </div>
                </div>
                <span className="mn-fold-h">Staff grants (over 500 needs a second approver)</span>
                {grants.length ? (
                  <div className="tw">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Reader</th>
                          <th className="r">Credits</th>
                          <th>Reason</th>
                          <th>By</th>
                          <th>Approved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...grants].reverse().slice(0, 50).map(g => {
                          const by = (g.meta as { approved_by?: string } | null)?.approved_by;
                          return (
                            <tr key={g.id}>
                              <td className="nw" title={ledgerDate(g.created_at)}>{dayMonth(g.created_at)}</td>
                              <td>
                                <b>{nameOf(g.user_id)}</b>
                              </td>
                              <td className="n">{`+${n0(g.delta)}`}</td>
                              <td className="mn-wrap">{reasonOf.get(g.id) ?? ''}</td>
                              <td>{nameOf(g.actor_id)}</td>
                              <td className={by ? undefined : 'muted'}>{by ? nameOf(by) : 'Not needed'}</td>
                            </tr>
                          );
                        })}
                        <tr className="mn-tot">
                          <td colSpan={2}>Total this month</td>
                          <td className="n">{`+${n0(grantTotal)}`}</td>
                          <td colSpan={3}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <span className="muted">No staff grants this month.</span>
                )}
                {expired > 0 && <span className="muted">{`${n0(expired)} credits expired so far in ${month.name}.`}</span>}
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
