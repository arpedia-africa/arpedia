import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { guard } from '@/lib/money';
import type { Staff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { RowLink } from '../../books/row';
import { flutterwaveBalance } from '../actions';
import { bankLabel, cycleStatus, day, monthLabel, n0, past } from '../shared';
import { CycleActions } from './client';
import { credits, groups, loadCycle, nextMonth, sum, type CycleDetail, type Line } from './data';

/** How many payable authors get a row of their own before the rest fold into one. */
const TOP = 8;

/** The month for a cycle page (and the release overlay drawn over it), or the page to show instead. */
export async function cycleFor(id: string): Promise<{ c: CycleDetail; staff: Staff } | { page: ReactNode }> {
  const { staff, denied } = await guard('royalties', 'Author earnings');
  if (denied) return { page: denied };
  const r = await loadCycle(await serverSupabase(), id);
  if ('denied' in r) return { page: <NoAccess page="royalties" label="Author earnings" role={staff.role} /> };
  if ('missing' in r) notFound();
  return { c: r.cycle, staff };
}

/** s-royalty-cycle: earnings by author, calculation, checks, what was not paid, release (rule 31). */
export async function CycleScreen({ c, staff }: { c: CycleDetail; staff: Staff }) {
  const supabase = await serverSupabase();
  const month = monthLabel(c.month, { bare: true });
  const title = monthLabel(c.month);
  const g = groups(c.lines);
  const st = cycleStatus(c.status, 0);
  const isSuper = staff.role === 'super_admin';
  const iPrepared = c.prepared_by === staff.id;
  // Before Prepare, the checks are worked out live; after, they are the ones Prepare recorded.
  const recheck = c.checks ? null : (await supabase.rpc('recheck_cycle', { p_cycle: c.id })).data as { diff_kobo?: number } | null;
  const balance = c.checks?.flutterwave_balance_kobo ?? (c.status === 'closed' ? await flutterwaveBalance() : null);
  const ledgerOk = c.checks ? c.checks.ledger_match : Number(recheck?.diff_kobo ?? 0) === 0;
  const sendKobo = sum(g.sendable, l => l.payable_kobo);
  const payKobo = sum(g.pays, l => l.payable_kobo);
  const payCredits = sum(g.pays, credits);
  const carriedKobo = sum(g.carried, l => l.payable_kobo);
  const verified = g.pays.length;
  const needAccounts = g.held.filter(l => l.status === 'held_unverified').length;
  const top = g.pays.slice(0, g.pays.length > TOP + 1 ? TOP : g.pays.length);
  const rest = g.pays.slice(top.length);
  const rate = `₦${(c.author_rate_kobo / 100).toFixed(2)}`;
  const lastDay = new Date(Date.UTC(Number(c.month.slice(0, 4)), Number(c.month.slice(5, 7)), 0)).getUTCDate();
  const ex = c.exclusions;
  const notPaid = sum(Object.values(ex), x => x?.credits ?? 0);
  const next = monthLabel(nextMonth(c.month), { bare: true });

  const meta = [
    st.label,
    c.closed_at ? `closed ${day(c.closed_at)}` : null,
    c.hold_ends_at ? `hold ${past(c.hold_ends_at) ? 'ended' : 'ends'} ${day(c.hold_ends_at)}` : null,
  ].filter(Boolean);

  const step = (n: number, label: string, small: string, state: 'ok' | 'on' | '') => (
    <div className={`stp${state ? ` ${state}` : ''}`}>
      <i>{n}</i>
      <span>
        <b>{label}</b>
        <small>{small}</small>
      </span>
    </div>
  );
  const now = Math.min(5, ['open', 'closed', 'prepared', 'approved', 'releasing', 'paid', 'paid_with_failures'].indexOf(c.status));
  /** Step state: done once the month reached `done`, current while it sits in `on`. */
  const state = (done: number, on: number[]) => (now >= done ? 'ok' : on.includes(now) ? 'on' : '') as 'ok' | 'on' | '';

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/royalties">Author earnings</Link>
          <Icon name="chev" size="s" />
          <span>{title}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>{title}</h1>
            <div className="ph__meta">{meta.join(' · ')}</div>
          </div>
          <CycleActions
            id={c.id}
            month={month}
            file={`arpedia-author-earnings-${c.month.slice(0, 7)}.csv`}
            status={c.status}
            canPrepare={ledgerOk && past(c.hold_ends_at)}
            canRelease={isSuper && !iPrepared}
            lines={c.lines.map(l => ({ ...l }))}
          />
        </div>
      </div>
      <div className="page">
        <StatusLine c={c} isSuper={isSuper} iPrepared={iPrepared} />
        <div className="panel">
          <div className="panel__body">
            <div className="mn-flow">
              {step(1, 'Adding up', `1 to ${lastDay} ${month.slice(0, 3)}`, state(1, [0]))}
              {step(2, 'Closed', c.closed_at ? day(c.closed_at) : 'On the 1st', state(1, []))}
              {step(3, 'Prepared', c.prepared_at ? `${c.prepared_name ?? 'Finance'}, ${day(c.prepared_at)}` : 'Waiting for Finance', state(2, [1]))}
              {step(4, 'Approved and released', c.approved_at ? `${c.approved_name ?? 'Super admin'}, ${day(c.approved_at)}` : 'Waiting for a Super admin', state(4, [2, 3]))}
              {step(5, 'Paid', now >= 5 ? 'Flutterwave confirmed' : 'After Flutterwave confirms', state(5, [4]))}
            </div>
          </div>
        </div>
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Earnings by author</h2>
                <span className="sub">
                  {`${n0(c.lines.length)} author${c.lines.length === 1 ? '' : 's'} · ${n0(g.pays.length)} payable${g.carried.length ? `, ${g.carried.length} carried over` : ''}${g.held.length ? `, ${g.held.length} held` : ''}`}
                </span>
              </div>
              {c.lines.length === 0 ? (
                <div className="empty" style={{ padding: '48px 24px' }}>
                  <b>No author earnings this month</b>
                  <span>Nobody spent credits on a book, tip or message in {month}.</span>
                </div>
              ) : (
                <>
                  <div className="tw">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Author</th>
                          <th className="r">Book credits</th>
                          <th className="r">Tips and messages</th>
                          <th className="r">Credits</th>
                          <th className="r">Earnings</th>
                          <th>Bank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map(l => (
                          <AuthorRow key={l.id} l={l} />
                        ))}
                        {rest.length > 0 && (
                          <tr>
                            <td>
                              <b>{`${n0(rest.length)} other authors`}</b>
                            </td>
                            <td className="n">{n0(sum(rest, l => l.book_credits))}</td>
                            <td className="n">{n0(sum(rest, l => l.tip_message_credits))}</td>
                            <td className="n">{n0(sum(rest, credits))}</td>
                            <td className="n">
                              <b>{naira(sum(rest, l => l.payable_kobo))}</b>
                            </td>
                            <td>{rest.every(l => l.bank_status === 'verified') ? 'Verified' : ''}</td>
                          </tr>
                        )}
                        {g.held.map(l => (
                          <AuthorRow key={l.id} l={l} />
                        ))}
                        {g.carried.length > 0 && (
                          <tr className="mn-sub">
                            <td>{`${g.carried.length} author${g.carried.length === 1 ? '' : 's'} under ${naira(c.min_payout_kobo ?? 100_000)}`}</td>
                            <td className="n">{n0(sum(g.carried, l => l.book_credits))}</td>
                            <td className="n">{n0(sum(g.carried, l => l.tip_message_credits))}</td>
                            <td className="n">{n0(sum(g.carried, credits))}</td>
                            <td className="n">{`${naira(carriedKobo)} to ${next.slice(0, 3)}`}</td>
                            <td></td>
                          </tr>
                        )}
                        <tr className="mn-tot">
                          <td>Total</td>
                          <td className="n">{n0(c.credits_books)}</td>
                          <td className="n">{n0(c.credits_tips_messages)}</td>
                          <td className="n">{n0(c.credits_books + c.credits_tips_messages)}</td>
                          <td className="n">{naira(c.earnings_kobo)}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="panel__foot">
                    {`Payable now: ${n0(payCredits)} credits × ${rate} = ${naira(payKobo)} for ${n0(g.pays.length)} author${g.pays.length === 1 ? '' : 's'}.`}
                    {g.carried.length > 0 &&
                      ` The ${g.carried.length} carried-over amount${g.carried.length === 1 ? '' : 's'} (${naira(carriedKobo)}) ${g.carried.length === 1 ? 'is' : 'are'} added to ${next}.`}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Calculation</h2>
              </div>
              <div className="panel__body">
                <div className="kv-row">
                  <span>Credits spent on books</span>
                  <b>{n0(c.credits_books)}</b>
                </div>
                <div className="kv-row">
                  <span>Credits spent on tips and messages</span>
                  <b>{n0(c.credits_tips_messages)}</b>
                </div>
                <div className="kv-row">
                  <span>Author rate</span>
                  <b>{`${rate} a credit`}</b>
                </div>
                <div className="kv-row total">
                  <span>Author earnings</span>
                  <b>{naira(c.earnings_kobo)}</b>
                </div>
                <div className="kv-row">
                  <span>Net revenue (after store fees and refunds)</span>
                  <b>{c.net_revenue_kobo == null ? 'Not in yet' : naira(c.net_revenue_kobo)}</b>
                </div>
                <div className="kv-row">
                  <span>Arpedia after author earnings</span>
                  <b>{c.net_revenue_kobo == null ? 'Not in yet' : naira(c.net_revenue_kobo - c.earnings_kobo)}</b>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Checks before release</h2>
              </div>
              <div className="panel__body">
                <Check ok={ledgerOk} bad="Differs">
                  {ledgerOk
                    ? `Credits match the credit ledger for ${month}`
                    : `Credits differ from the credit ledger by ${naira(Math.abs(Number(c.checks?.diff_kobo ?? recheck?.diff_kobo ?? 0)))}`}
                </Check>
                <Check ok={past(c.hold_ends_at)} bad="Waiting">
                  {`Hold of ${c.hold_days ?? 30} days ${past(c.hold_ends_at) ? 'ended' : 'ends'} ${c.hold_ends_at ? day(c.hold_ends_at) : ''}`}
                </Check>
                <Check ok={balance == null ? null : balance >= sendKobo} bad="Short">
                  {balance == null
                    ? `Flutterwave balance not read yet · ${naira(sendKobo)} to send`
                    : `Flutterwave balance ${naira(balance)} ${balance >= sendKobo ? 'covers' : "doesn't cover"} ${naira(sendKobo)}`}
                </Check>
                <Check ok={needAccounts === 0} bad={`${needAccounts} held`}>
                  {`Bank accounts verified: ${n0(verified)} of ${n0(verified + needAccounts)}.`}
                  {needAccounts > 0 && (
                    <>
                      {' '}
                      <Link className="link" href="/bank-accounts">{`Verify the other ${needAccounts}`}</Link>
                    </>
                  )}
                </Check>
                {c.previous_failed > 0 && (
                  <div className="row">
                    <span className="st st-warn">Open</span>
                    <span>
                      {`${c.previous_failed_month ? monthLabel(c.previous_failed_month, { bare: true }) : 'Earlier'}: ${c.previous_failed} transfer${c.previous_failed === 1 ? '' : 's'} still failed. `}
                      <Link className="link" href="/payouts?status=failed">
                        Open payouts
                      </Link>
                    </span>
                  </div>
                )}
              </div>
            </div>
            <details className="fold">
              <summary>
                More details <small>what was not paid</small>
              </summary>
              <div className="fold__b">
                <div>
                  <div className="kv-row">
                    <span>Chapter charges undone by readers (10-minute undo)</span>
                    <b>{`${n0(ex.undone?.credits ?? 0)} credits`}</b>
                  </div>
                  <div className="kv-row">
                    <span>Chapters returned by Support</span>
                    <b>{`${n0(ex.staff_return?.credits ?? 0)} credits`}</b>
                  </div>
                  <div className="kv-row">
                    <span>Unspent credits taken back by refunds</span>
                    <b>{`${n0(ex.refund_clawback?.credits ?? 0)} credits`}</b>
                  </div>
                  <div className="kv-row">
                    <span>{`Gift loops frozen${ex.gift_loop?.readers ? ` (${ex.gift_loop.readers} account${ex.gift_loop.readers === 1 ? '' : 's'})` : ''}`}</span>
                    <b>{`${n0(ex.gift_loop?.credits ?? 0)} credits`}</b>
                  </div>
                  {(ex.self_read?.credits ?? 0) > 0 && (
                    <div className="kv-row">
                      <span>Authors reading their own books</span>
                      <b>{`${n0(ex.self_read!.credits)} credits`}</b>
                    </div>
                  )}
                  {(ex.takedown?.credits ?? 0) > 0 && (
                    <div className="kv-row">
                      <span>Books taken down after a copyright claim</span>
                      <b>{`${n0(ex.takedown!.credits)} credits`}</b>
                    </div>
                  )}
                  <div className="kv-row total">
                    <span>Not paid</span>
                    <b>{`${n0(notPaid)} credits`}</b>
                  </div>
                </div>
                <span className="muted">Authors can’t buy their own books, so self-reads never earn.</span>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthorRow({ l }: { l: Line }) {
  const b = bankLabel(l);
  const cells = (
    <>
      <td>
        <b>{l.name}</b>
      </td>
      <td className="n">{n0(l.book_credits)}</td>
      <td className="n">{n0(l.tip_message_credits)}</td>
      <td className="n">{n0(credits(l))}</td>
      <td className="n">
        <b>{naira(l.payable_kobo)}</b>
      </td>
      <td>{b.cls ? <span className={b.cls}>{b.label}</span> : b.label}</td>
    </>
  );
  if (l.bank_status === 'needs_review' && l.bank_account_id) {
    return <RowLink href={`/bank-accounts/${l.bank_account_id}`}>{cells}</RowLink>;
  }
  if (l.status === 'held_unverified') return <RowLink href="/bank-accounts">{cells}</RowLink>;
  return <tr>{cells}</tr>;
}

function Check({ ok, bad, children }: { ok: boolean | null; bad: string; children: ReactNode }) {
  return (
    <div className="row">
      {ok ? <span className="st-plain">Passed</span> : <span className="st st-warn">{ok == null ? 'Unknown' : bad}</span>}
      <span>{children}</span>
    </div>
  );
}

const RETRY_AT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

function StatusLine({ c, isSuper, iPrepared }: { c: CycleDetail; isSuper: boolean; iPrepared: boolean }) {
  const line = (dot: string, b: string, rest: string) => (
    <div className="sline">
      <span className={dot ? `dot ${dot}` : 'dot'}></span>
      <span>
        <b>{b}</b>
        {rest ? ` ${rest}` : ''}
      </span>
    </div>
  );
  switch (c.status) {
    case 'closed':
      return line('warn', 'Closed · waiting for Finance to prepare.', 'Preparing runs the checks below and records who prepared it.');
    case 'prepared':
    case 'approved':
      return line(
        'warn',
        `Prepared by ${c.prepared_name ?? 'Finance'} · waiting for a Super admin to approve.`,
        `Two people must agree before money moves.${isSuper && !iPrepared ? ' You are a Super admin, so you can approve.' : iPrepared ? ' You prepared it, so another Super admin approves.' : ''}`,
      );
    case 'releasing':
      if (c.retrying)
        return line(
          'warn',
          'Paused, retrying.',
          `Flutterwave did not take ${c.retrying.count === 1 ? '1 transfer' : `${c.retrying.count} transfers`} (${naira(c.retrying.kobo)}). No money moved.${c.retrying.next_at ? ` The next try is ${RETRY_AT.format(new Date(c.retrying.next_at))}.` : ''} Finance was emailed.`,
        );
      return line('warn', `Released by ${c.approved_name ?? 'a Super admin'} · transfers are going out.`, 'The month shows Paid once Flutterwave confirms every transfer.');
    case 'paid':
      return line('', 'Paid.', 'Flutterwave confirmed every transfer.');
    case 'paid_with_failures':
      return line('warn', 'Paid, with failed transfers.', 'Retry them from Payouts once the accounts are fixed.');
    default:
      return null;
  }
}
