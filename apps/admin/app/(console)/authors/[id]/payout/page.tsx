import Link from 'next/link';
import { notFound } from 'next/navigation';
import { naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { serverSupabase } from '@/lib/supabase/server';
import { initials } from '../../../books/shared';
import { day, longDay, monthLabel, past } from '../../../royalties/shared';
import { authorName, avClass, gate, loadAuthor } from '../../shared';
import type { PauseReason } from './actions';
import { HoldPanel, PayoutHeadActions } from './hold';

interface PayoutData {
  account: {
    bank_name: string;
    account_last4: string;
    bank_account_name: string;
    legal_name: string;
    match_score: number;
    status: 'needs_review' | 'verified';
    verified_at: string | null;
    created_at: string;
    payouts_resume_at: string;
  } | null;
  has_account: boolean;
  lines: {
    id: string;
    month: string;
    payout_date: string | null;
    payable_kobo: number;
    amount_kobo: number;
    status: string;
    payout: { reference: string; status: string; settled_at: string | null; failure_reason: string | null } | null;
  }[];
  statements: { id: string; kind: 'cycle' | 'year_to_date'; month: string | null; created_at: string }[];
  hold: { reason: PauseReason; note: string | null; set_at: string; set_name: string | null } | null;
}

const LINE_STATUS: Record<string, string> = {
  payable: 'Payable',
  carried: 'Carried over',
  held_unverified: 'Held, not verified',
  held_paused: 'Held, paused',
  held_dispute: 'Held, needs review',
  queued: 'Sending',
  paid: 'Paid',
  partly_failed: 'Failed',
};

/**
 * Author payout account (s-author-payout): account and name check, payout history with transfer
 * references, statements, hold. Support sees the payout state but never bank details.
 */
export default async function AuthorPayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate();
  if ('denied' in g) return g.denied;
  const supabase = await serverSupabase();
  const r = await loadAuthor(supabase, id);
  if ('denied' in r) return <NoAccess page="applications" label="Authors and applications" role={g.staff.role} />;
  if ('missing' in r) notFound();
  const a = r.author;
  const name = authorName(a);
  const first = name.split(' ')[0] ?? name;
  const { data, error } = await supabase.rpc('admin_author_payout', { p_author: id });
  const p = error ? null : (data as unknown as PayoutData);
  const canEdit = g.staff.permissions.includes('release_payouts');
  const paused = !!p?.hold || a.profile.payouts_paused;
  const next = p?.lines.find(l => l.status === 'payable' || l.status === 'queued');
  const acct = p?.account;
  const legal = acct?.legal_name || a.profile.legal_name;
  const cycleStatement = p?.statements.find(s => s.kind === 'cycle');

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/authors">Authors</Link>
          <Icon name="chev" size="s" />
          <Link href={`/authors/${id}`}>{name}</Link>
          <Icon name="chev" size="s" />
          <span>Payout account</span>
        </div>
        <div className="ph__row">
          <span className={`av lg ${avClass(id)}`}>{initials(name)}</span>
          <div className="ph__title">
            <h1>{name}</h1>
            <div className="ph__meta">
              <span>{paused ? 'Payouts paused' : 'Payouts on'}</span>
              <span>
                {next
                  ? `Next payout: ${monthLabel(next.month, { bare: true })} earnings, ${naira(next.payable_kobo)}${next.payout_date ? `${past(next.payout_date) ? ', due' : ', after the hold ends on'} ${longDay(next.payout_date)}` : ''}`
                  : 'No payout waiting'}
              </span>
            </div>
          </div>
          <PayoutHeadActions
            author={id}
            name={name}
            statement={cycleStatement?.month ? { id: cycleStatement.id, label: monthLabel(cycleStatement.month, { bare: true }) } : null}
          />
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Account</h2>
                {acct ? (
                  acct.status === 'verified' ? (
                    <span className="st-plain">Verified</span>
                  ) : (
                    <span className="st st-warn">Needs review</span>
                  )
                ) : p?.has_account ? (
                  <span className="st-plain">Set</span>
                ) : (
                  <span className="st st-warn">Not set</span>
                )}
              </div>
              <div className="panel__body">
                {acct ? (
                  <dl className="kv">
                    <dt>Bank</dt>
                    <dd>{acct.bank_name}</dd>
                    <dt>Account number</dt>
                    <dd className="mono">{`••••${acct.account_last4}`}</dd>
                    <dt>Account name</dt>
                    <dd>{acct.bank_account_name}</dd>
                    <dt>Legal name on file</dt>
                    <dd>{`${legal || 'Not on file'}${Number(acct.match_score) >= 90 ? ' · matches' : ` · ${Math.round(Number(acct.match_score))}% match`}`}</dd>
                    <dt>Verified with</dt>
                    <dd>
                      {acct.verified_at ? (
                        `Bank name check, ${day(acct.verified_at)}`
                      ) : (
                        <Link className="link" href="/bank-accounts">
                          Waiting for review
                        </Link>
                      )}
                    </dd>
                    {a.profile.payee_type && (
                      <>
                        <dt>Account type</dt>
                        <dd>{a.profile.payee_type === 'company' ? 'Company' : 'Individual · WHT not applied'}</dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <div className="empty" style={{ padding: '32px 16px' }}>
                    {p?.has_account ? (
                      <>
                        <b>Bank details are for Finance</b>
                        <span>{`${first} has a payout account. Only Finance and Super admins see its details.`}</span>
                      </>
                    ) : (
                      <>
                        <b>No payout account yet</b>
                        <span>{`${first} adds one in Author Studio. Earnings are held, not lost, until it is verified.`}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Payout history</h2>
              </div>
              {!p || p.lines.length === 0 ? (
                <div className="empty" style={{ padding: '40px 24px' }}>
                  <b>{p ? 'No payouts yet' : 'Payout history is for Finance and Support'}</b>
                  <span>
                    {p
                      ? 'Each monthly payout, with its transfer reference, shows here once a month closes.'
                      : 'Ask Finance if you need this author’s payouts.'}
                  </span>
                </div>
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Cycle</th>
                        <th className="r">Amount</th>
                        <th>Transfer reference</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.lines.map(l => (
                        <tr key={l.id}>
                          <td>{monthLabel(l.month)}</td>
                          <td className="n">{naira(l.payable_kobo || l.amount_kobo)}</td>
                          <td className="mono">{l.payout?.reference ?? ''}</td>
                          <td>
                            {l.status === 'partly_failed' ? <span className="st st-err">Failed</span> : (LINE_STATUS[l.status] ?? l.status)}
                            {l.payout?.failure_reason && l.status === 'partly_failed' && (
                              <>
                                <br />
                                <small className="muted">{l.payout.failure_reason}</small>
                              </>
                            )}
                          </td>
                          <td className="nw">
                            {l.payout?.settled_at ? day(l.payout.settled_at) : l.payout_date ? day(l.payout_date) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="pager">
                <span>Statements</span>
                <div className="row">
                  {p?.statements.length ? (
                    p.statements.slice(0, 2).map(s => (
                      <a key={s.id} className="btn btn-g sm" href={`/authors/${id}/payout/statements/${s.id}`}>
                        <Icon name="down" />
                        {s.kind === 'cycle' && s.month ? `${monthLabel(s.month, { bare: true })} PDF` : `${new Date(s.created_at).getUTCFullYear()} year to date`}
                      </a>
                    ))
                  ) : (
                    <span className="muted">None yet</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="stack s20">
            <HoldPanel
              author={id}
              name={name}
              paused={paused}
              reason={p?.hold?.reason ?? ((a.profile.payouts_paused_reason as PauseReason | null) || null)}
              setBy={p?.hold?.set_name ?? null}
              note={p?.hold?.note ?? null}
              canEdit={canEdit}
            />
            <details className="fold">
              <summary>
                More details <small>verification history, change requests</small>
              </summary>
              <div className="fold__b">
                <b>Verification history</b>
                {acct ? (
                  <div className="tl">
                    {acct.verified_at && (
                      <div className="tl__i ok">
                        <b>{Number(acct.match_score) >= 90 ? 'Account verified and name matched' : 'Account verified by Finance'}</b>
                        <small>{`${day(acct.verified_at)} · ${Number(acct.match_score) >= 90 ? 'Flutterwave' : 'name check by a person'}`}</small>
                      </div>
                    )}
                    <div className="tl__i">
                      <b>Account added by author in Author Studio</b>
                      <small>{day(acct.created_at)}</small>
                    </div>
                  </div>
                ) : (
                  <span className="muted">Nothing yet. Account checks show here once an account is added.</span>
                )}
                <b>Change requests</b>
                <span className="muted">
                  {acct?.status === 'needs_review'
                    ? `A new account is waiting for review. Payouts to it start ${day(acct.payouts_resume_at)} at the earliest.`
                    : `None open. ${first} has not asked to change the bank account.`}
                </span>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
