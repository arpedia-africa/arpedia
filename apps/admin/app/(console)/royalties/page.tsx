import type { Metadata } from 'next';
import Link from 'next/link';
import { naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { Empty, guard } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { RowLink } from '../books/row';
import { cycleStatus, day, longDay, monthLabel, n0, past, type CycleStatus } from './shared';

export const metadata: Metadata = { title: 'Author earnings · Arpedia Admin' };

interface Cycle {
  id: string;
  month: string;
  status: CycleStatus;
  payout_date: string | null;
  hold_days: number | null;
  hold_ends_at: string | null;
  credits: number;
  earnings_kobo: number;
  authors: number;
  carried: number;
  payable_authors: number;
  payable_kobo: number;
  unverified: number;
  failed: number;
  paid_at: string | null;
}
interface Data {
  open: { month: string; credits: number; earnings_kobo: number; authors: number; payout_date: string };
  cycles: Cycle[];
  settings: { hold_days: number };
}

/** s-royalties: the month ready to release on top, then one row per month (rule 30). */
export default async function RoyaltiesPage() {
  const { denied } = await guard('royalties', 'Author earnings');
  if (denied) return denied;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_earning_cycles');
  const d = data as unknown as Data | null;
  const ready = d?.cycles.find(c => c.status === 'closed' || c.status === 'prepared' || c.status === 'approved');

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Author earnings</h1>
          </div>
          <div className="band__acts">
            <Link className="ib" href="/royalties/settings" aria-label="Earnings settings">
              <Icon name="cog" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        {ready && (
          <div className="urgent">
            <div className="urgent__b">
              <span className="urgent__k">{ready.status === 'closed' ? 'Ready to release' : 'Waiting for approval'}</span>
              <h2>{`${monthLabel(ready.month, { bare: true })}: ${naira(ready.payable_kobo)} for ${n0(ready.payable_authors)} author${ready.payable_authors === 1 ? '' : 's'}`}</h2>
              <p>
                {`${n0(ready.credits)} credits spent × ₦1.60. `}
                {ready.hold_ends_at &&
                  (past(ready.hold_ends_at)
                    ? `The ${ready.hold_days}-day hold ended ${longDay(ready.hold_ends_at)}.`
                    : `The ${ready.hold_days}-day hold ends ${longDay(ready.hold_ends_at)}.`)}
                {ready.unverified > 0 &&
                  ` ${ready.unverified} bank account${ready.unverified === 1 ? '' : 's'} still need${ready.unverified === 1 ? 's' : ''} verifying.`}
              </p>
            </div>
            <Link className="btn btn-n" href={`/royalties/${ready.id}`}>
              {`Review ${monthLabel(ready.month, { bare: true })}`}
            </Link>
          </div>
        )}
        <div className="panel panel--flush">
          {error || !d ? (
            <Empty title="Author earnings didn't load" text="Nothing changed. Reload the page to try again." />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Status</th>
                    <th className="r">Credits spent</th>
                    <th className="r">Author earnings</th>
                    <th className="r">Authors</th>
                    <th>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <b>{monthLabel(d.open.month)}</b>
                    </td>
                    <td>
                      <span className="st-plain">Open, adding up</span>
                    </td>
                    <td className="n">{`${n0(d.open.credits)} so far`}</td>
                    <td className="n">{`${naira(d.open.earnings_kobo)} so far`}</td>
                    <td className="n">{n0(d.open.authors)}</td>
                    <td className="muted">{`Planned ${day(d.open.payout_date)}`}</td>
                  </tr>
                  {d.cycles.map(c => {
                    const st = cycleStatus(c.status, c.failed);
                    const paid = c.status === 'paid' || c.status === 'paid_with_failures';
                    return (
                      <RowLink key={c.id} href={`/royalties/${c.id}`}>
                        <td>
                          <b>{monthLabel(c.month)}</b>
                        </td>
                        <td>
                          <span className={st.cls}>{st.label}</span>
                        </td>
                        <td className="n">{n0(c.credits)}</td>
                        <td className="n">{naira(c.earnings_kobo)}</td>
                        <td className="n">{`${n0(c.payable_authors)}${c.carried ? ` (+${c.carried} carried)` : ''}`}</td>
                        <td>
                          {paid ? (
                            <>
                              {c.paid_at ? `Paid ${day(c.paid_at)}` : 'Paid'}
                              {c.failed > 0 && (
                                <>
                                  {' · '}
                                  <Link className="link" href="/payouts?status=failed">{`${c.failed} to retry`}</Link>
                                </>
                              )}
                            </>
                          ) : c.status === 'releasing' ? (
                            'Sending now'
                          ) : c.hold_ends_at && !past(c.hold_ends_at) ? (
                            `Hold ends ${day(c.hold_ends_at)}`
                          ) : c.payout_date ? (
                            `Payout ${day(c.payout_date)}`
                          ) : (
                            ''
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
      </div>
    </section>
  );
}
