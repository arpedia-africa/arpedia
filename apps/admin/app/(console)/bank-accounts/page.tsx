import type { Metadata } from 'next';
import Link from 'next/link';
import { Flash } from '@/components/flash';
import { Chips, Empty, guard } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { RowLink } from '../books/row';
import { day } from '../royalties/shared';

export const metadata: Metadata = { title: 'Bank accounts · Arpedia Admin' };

const STATUSES = ['needs_review', 'verified', 'rejected'] as const;
type Status = (typeof STATUSES)[number];

interface Row {
  id: string;
  name: string;
  bank_name: string;
  account_last4: string;
  bank_account_name: string;
  legal_name: string;
  match_score: number;
  status: Status;
  created_at: string;
}

/** s-bank-accounts: the verification queue (oldest first), then verified and rejected accounts. */
export default async function BankAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; done?: string }>;
}) {
  const { status: raw, done } = await searchParams;
  const { denied } = await guard('bank-accounts', 'Bank accounts');
  if (denied) return denied;
  const status: Status = STATUSES.includes(raw as Status) ? (raw as Status) : 'needs_review';
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_bank_accounts', { p_status: status });
  const d = data as unknown as { rows: Row[]; counts: Record<Status, number> } | null;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Bank accounts</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/royalties">
              Author earnings
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="toolbar">
          <Chips
            items={[
              { href: '/bank-accounts', label: 'Needs review', count: d?.counts.needs_review, on: status === 'needs_review' },
              { href: '/bank-accounts?status=verified', label: 'Verified', count: d?.counts.verified, on: status === 'verified' },
              { href: '/bank-accounts?status=rejected', label: 'Rejected', count: d?.counts.rejected, on: status === 'rejected' },
            ]}
          />
        </div>
        <div className="panel panel--flush">
          {error || !d ? (
            <Empty title="Bank accounts didn't load" text="Nothing changed. Reload the page to try again." />
          ) : d.rows.length === 0 ? (
            <Empty
              title={status === 'needs_review' ? 'Nothing to review' : `No ${status} accounts`}
              text={
                status === 'needs_review'
                  ? 'Accounts whose bank name matches the legal name 90% or more verify on their own. The rest wait here for a person.'
                  : 'Accounts show here once they are decided.'
              }
            />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Author</th>
                    <th>Name on bank record</th>
                    <th className="r">Match</th>
                    <th>Submitted</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map(b => (
                    <RowLink key={b.id} href={`/bank-accounts/${b.id}`}>
                      <td>
                        <div className="who">
                          <span>
                            <b>{b.name}</b>
                            <small>{`${b.bank_name} ••••${b.account_last4}`}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="who">
                          <span>
                            {b.bank_account_name}
                            <small>{`Legal name: ${b.legal_name || 'not on file'}`}</small>
                          </span>
                        </div>
                      </td>
                      <td className="n">{`${Math.round(Number(b.match_score))}%`}</td>
                      <td className="nw">{day(b.created_at)}</td>
                      <td>
                        {b.status === 'needs_review' ? (
                          <span className="st st-warn">Needs review</span>
                        ) : (
                          <span className="st-plain">{b.status === 'verified' ? 'Verified' : 'Rejected'}</span>
                        )}
                      </td>
                    </RowLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {done && <Flash msg={done} />}
    </section>
  );
}
