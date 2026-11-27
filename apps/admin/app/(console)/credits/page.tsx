import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AUTHOR_RATE, ledgerDate, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { Empty, dayMonth, guard, n0, thisMonth } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { ApprovalButtons, FreezeGiftLoop, FreezeGifting } from './client';

export const metadata: Metadata = { title: 'Credits · Arpedia Admin' };

/** What admin_credits_overview returns for the month (all counts in credits, money in kobo). */
interface Overview {
  issued: number;
  issued_plans: number;
  issued_topups: number;
  issued_staff: number;
  staff_grants: number;
  spent: number;
  spent_unlock_all: number;
  spent_chapter: number;
  spent_message: number;
  spent_gift: number;
  spent_tip: number;
  author_earning_kobo: number;
  expired: number;
  unspent: number;
  owed_kobo: number;
  expiring: number;
  expiring_kobo: number;
  top_books: { book_id: string; title: string; author: string | null; pages: number | null; price: number | null; credits: number; readers: number }[];
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
  const [overview, grantRows, alerts, requests, config] = await Promise.all([
    supabase.rpc('admin_credits_overview', { p_from: month.iso, p_to: new Date().toISOString() }),
    supabase
      .from('credit_ledger')
      .select('id, user_id, actor_id, delta, note, meta, created_at')
      .eq('reason', 'staff_adjust')
      .gt('delta', 0)
      .gte('created_at', month.iso)
      .order('created_at', { ascending: false })
      .limit(50),
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
  if (overview.error) throw overview.error;
  if (grantRows.error) throw grantRows.error;
  if (alerts.error) throw alerts.error;
  if (requests.error) throw requests.error;

  const o = overview.data as unknown as Overview;
  const frozen = config.data?.value === true;
  const issued = o.issued;
  const spent = o.spent;
  const toAuthors = o.author_earning_kobo;
  const bySpend = [
    ['Books, paid upfront', o.spent_unlock_all],
    ['Books, pay as you read', o.spent_chapter],
    ['Messages to authors', o.spent_message],
    ['Gifts', o.spent_gift],
    ['Tips', o.spent_tip],
  ] as const;
  const grants = grantRows.data;
  const grantTotal = o.issued_staff;
  const top = o.top_books;

  // Names for the grants table.
  const people = [...new Set(grants.flatMap(g => [g.user_id, g.actor_id, (g.meta as { approved_by?: string } | null)?.approved_by ?? null]))].filter(
    (p): p is string => !!p,
  );
  const { data: names } = people.length
    ? await supabase.from('profiles').select('id, full_name').in('id', people)
    : { data: [] };
  const nameOf = (id: string | null | undefined) => (names ?? []).find(p => p.id === id)?.full_name || '—';
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
            <span className="kpi__v">{n0(o.unspent)}</span>
            <span className="kpi__d">{`Owed to readers · ${naira(o.owed_kobo)} at ₦3`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Expiring this month</span>
            <span className="kpi__v">{n0(o.expiring)}</span>
            <span className="kpi__d">{`Rolled over, ends at renewal · ${naira(o.expiring_kobo)}`}</span>
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
                      {top.map((b, i) => (
                        <tr key={b.book_id}>
                          <td>
                            <div className="who">
                              <span className={`cv c${[1, 3, 2, 4, 6][i]} x32`}></span>
                              <span>
                                <b>{b.title}</b>
                                <small>{[b.author, b.pages ? `${n0(b.pages)} pages` : ''].filter(Boolean).join(' · ')}</small>
                              </span>
                            </div>
                          </td>
                          <td className="n">{b.price ? n0(b.price) : '—'}</td>
                          <td className="n">{n0(b.readers)}</td>
                          <td className="n">{n0(b.credits)}</td>
                        </tr>
                      ))}
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
                          {a.kind !== 'gift_loop' && <span className="st st-err">Likely farming</span>}
                          {a.kind === 'gift_loop' ? (
                            <FreezeGiftLoop alertId={a.id} frozen={frozen} />
                          ) : (
                            !frozen && <FreezeGifting frozen={false} />
                          )}
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
                    <b>{n0(o.issued_plans)}</b>
                  </div>
                  <div className="kv-row">
                    <span>Issued by top-ups</span>
                    <b>{n0(o.issued_topups)}</b>
                  </div>
                  <div className="kv-row">
                    <span>{`Staff grants (${n0(o.staff_grants)})`}</span>
                    <b>{n0(grantTotal)}</b>
                  </div>
                  <div className="kv-row">
                    <span>Issued minus spent, this month</span>
                    <b>{`${issued - spent >= 0 ? '+' : '−'}${n0(Math.abs(issued - spent))}`}</b>
                  </div>
                  <div className="kv-row">
                    <span>Credits in all balances</span>
                    <b>{n0(o.unspent)}</b>
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
                        {grants.map(g => {
                          const by = (g.meta as { approved_by?: string } | null)?.approved_by;
                          return (
                            <tr key={g.id}>
                              <td className="nw" title={ledgerDate(g.created_at)}>{dayMonth(g.created_at)}</td>
                              <td>
                                <b>{nameOf(g.user_id)}</b>
                              </td>
                              <td className="n">{`+${n0(g.delta)}`}</td>
                              <td className="mn-wrap">{g.note ?? ''}</td>
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
                {o.expired > 0 && <span className="muted">{`${n0(o.expired)} credits expired so far in ${month.name}.`}</span>}
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
