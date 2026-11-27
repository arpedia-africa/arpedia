import Link from 'next/link';
import { naira } from '@arpedia/core';
import { Flash } from '@/components/flash';
import { Icon } from '@/components/icon';
import { Chips, Empty, avClass, dayMonth, guard, initials, n0, planName } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { RowLink } from '../books/row';
import { ReturnDecision } from './returns';

export const RECOMMENDATION: Record<string, string> = {
  full: 'Refund in full',
  partial: 'Partial or decline',
  decline: 'Decline',
  duplicate: 'Refund the duplicate',
};

const RETURN_REASON: Record<string, string> = {
  skipped_ahead: 'Skipped ahead by mistake',
  did_not_open: 'Chapter didn’t open or display',
  wrong_book: 'Wrong book',
};

const GROUPS = {
  waiting: ['waiting', 'refunding', 'failed'],
  refunded: ['refunded'],
  declined: ['declined'],
} as const;
type Group = keyof typeof GROUPS;

/** Refund requests (s-refunds): web payments only, with credits used and a recommendation. Only Waiting carries a pill. */
export async function RefundsScreen({ group, done }: { group?: string; done?: string }) {
  const { staff, denied } = await guard('refunds', 'Refunds');
  if (denied) return denied;

  const current: Group = group === 'refunded' || group === 'declined' ? group : 'waiting';
  const supabase = await serverSupabase();
  const count = (g: Group) =>
    supabase.from('refund_requests').select('id', { count: 'exact', head: true }).in('status', [...GROUPS[g]]);
  const [res, waiting, refunded, declined, returnsRes] = await Promise.all([
    supabase
      .from('refund_requests')
      .select(
        `id, reason, requested_at, credits_granted, credits_used, recommendation, status, decided_at,
         tx:transactions!refund_requests_transaction_id_fkey(plan_code, topup_code, kind, gross_kobo),
         user:profiles!refund_requests_user_id_fkey(full_name, username)`,
      )
      .in('status', [...GROUPS[current]])
      .order('requested_at', { ascending: current === 'waiting' })
      .limit(100),
    count('waiting'),
    count('refunded'),
    count('declined'),
    // Chapter returns waiting for Finance (flow 14 rule 39); a role that can't list them sees none.
    supabase.rpc('admin_list_credit_returns'),
  ]);
  if (res.error) throw res.error;
  const rows = res.data;
  const returns = current === 'waiting' && !returnsRes.error ? (returnsRes.data ?? []) : [];
  const canDecideReturns = staff.role === 'finance' || staff.role === 'super_admin';
  const counts = { waiting: waiting.count ?? 0, refunded: refunded.count ?? 0, declined: declined.count ?? 0 };

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Refund requests</h1>
          </div>
          <div className="band__acts">
            <Link className="ib" href="/exports" aria-label="Export refunds">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="toolbar">
          <Chips
            items={[
              { href: '/refunds', label: 'Waiting', count: counts.waiting, on: current === 'waiting' },
              { href: '/refunds?status=refunded', label: 'Refunded', count: counts.refunded, on: current === 'refunded' },
              { href: '/refunds?status=declined', label: 'Declined', count: counts.declined, on: current === 'declined' },
            ]}
          />
        </div>
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <Empty
              title={current === 'waiting' ? 'No refunds waiting' : `No ${current} requests`}
              text={
                current === 'waiting'
                  ? 'Web payment refund requests show here. Google Play and App Store refunds are decided by the stores and happen on their own.'
                  : 'Requests you have decided show here.'
              }
            />
          ) : (
            <div className="tw">
              <table className="tbl mn-tr">
                <thead>
                  <tr>
                    <th>Requester</th>
                    <th className="r">Amount</th>
                    <th>Reason</th>
                    <th className="r">Credits used</th>
                    <th>Recommendation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const name = r.user?.full_name || (r.user?.username ? `@${r.user.username}` : 'Reader');
                    const item = r.tx?.kind === 'topup' ? 'Top-up' : planName(r.tx?.plan_code);
                    const decided = r.decided_at ? dayMonth(r.decided_at) : '';
                    return (
                      <RowLink key={r.id} href={`/refunds/${r.id}`}>
                        <td>
                          <div className="who">
                            <span className={`av sm ${avClass(r.id)}`}>{initials(name)}</span>
                            <span>
                              <b>{name}</b>
                              <small>{`${item}, web · requested ${dayMonth(r.requested_at)}`}</small>
                            </span>
                          </div>
                        </td>
                        <td className="n">{naira(r.tx?.gross_kobo ?? 0)}</td>
                        <td className="mn-wrap">{r.reason}</td>
                        <td className="n">{`${n0(r.credits_used)} of ${n0(r.credits_granted)}`}</td>
                        <td>{RECOMMENDATION[r.recommendation] ?? r.recommendation}</td>
                        <td>
                          {r.status === 'waiting' ? (
                            <span className="st st-warn">Waiting</span>
                          ) : r.status === 'refunded' ? (
                            `Refunded ${decided}`.trim()
                          ) : r.status === 'declined' ? (
                            `Declined ${decided}`.trim()
                          ) : r.status === 'refunding' ? (
                            'Refund sent to Flutterwave'
                          ) : (
                            'Refund failed, try again'
                          )}
                        </td>
                      </RowLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {returns.length > 0 && (
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Chapter returns waiting for Finance</h2>
              <span className="sub">{`${n0(returns.length)} over 50 credits or a 4th return in 30 days`}</span>
            </div>
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Reader</th>
                    <th>Chapter</th>
                    <th className="r">Credits</th>
                    <th>Reason</th>
                    <th>Asked by</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody className="mn-tr">
                  {returns.map(r => (
                    <tr key={r.id}>
                      <td>
                        <Link className="link" href={`/users/${r.user_id}`}>
                          {r.user_name || 'Reader'}
                        </Link>
                      </td>
                      <td className="mn-wrap">{[r.book_title, r.chapter_title].filter(Boolean).join(' · ') || 'Chapter'}</td>
                      <td className="n">{n0(r.credits)}</td>
                      <td>{RETURN_REASON[r.reason] ?? r.reason}</td>
                      <td>
                        {r.requested_by_name || '—'}
                        <small className="faint">{` · ${dayMonth(r.created_at)}`}</small>
                      </td>
                      <td className="acts">
                        <ReturnDecision id={r.id} canDecide={canDecideReturns} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {done && <Flash msg={done} />}
    </section>
  );
}
