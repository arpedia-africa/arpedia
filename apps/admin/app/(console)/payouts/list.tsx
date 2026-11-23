import Link from 'next/link';
import { naira } from '@arpedia/core';
import { Flash } from '@/components/flash';
import { Icon } from '@/components/icon';
import { Chips, Empty, PAGE_SIZE, Pager, guard, pageNo, safeTerm } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { ToastButton } from '../books/[id]/book-menu';
import { RowLink } from '../books/row';
import { flutterwaveBalance } from '../royalties/actions';
import { day, monthLabel, n0 } from '../royalties/shared';

export interface PayoutRow {
  id: string;
  author_id: string;
  name: string;
  month: string;
  amount_kobo: number;
  reference: string;
  flutterwave_transfer_id: string | null;
  status: 'queued' | 'pending' | 'successful' | 'failed' | 'reversed';
  failure_reason: string | null;
  bank_name: string | null;
  account_last4: string | null;
  waiting_for_account: boolean;
  queued_at: string;
  sent_at: string | null;
  settled_at: string | null;
  can_retry: boolean;
}
interface Data {
  rows: PayoutRow[];
  total: number;
  counts: { all: number; successful: number; pending: number; failed: number; reversed: number };
  kpis: {
    paid_on: string | null;
    paid_kobo: number;
    paid_count: number;
    failed_kobo: number;
    failed_count: number;
    pending_count: number;
    pending_kobo: number;
    releasing_kobo: number;
  };
}

const FILTERS = ['successful', 'pending', 'failed', 'reversed'] as const;
type Filter = (typeof FILTERS)[number];

export interface PayoutsSearch {
  status?: string;
  q?: string;
  page?: string;
  done?: string;
}

/** s-payouts (rule 33): key numbers, then every transfer with bank, reference and failure reason. */
export async function PayoutsScreen({ sp }: { sp: PayoutsSearch }) {
  const { denied } = await guard('payouts', 'Payouts');
  if (denied) return denied;
  const status = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : null;
  const q = safeTerm(sp.q ?? '');
  const page = pageNo(sp.page);
  const supabase = await serverSupabase();
  const [{ data, error }, balance] = await Promise.all([
    supabase.rpc('admin_payouts', {
      p_status: status === 'pending' ? 'pending' : (status ?? undefined),
      p_q: q || undefined,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    flutterwaveBalance(),
  ]);
  const d = data as unknown as Data | null;
  const href = (p: { status?: string | null; page?: number }) => {
    const u = new URLSearchParams();
    const s = p.status === undefined ? status : p.status;
    if (s) u.set('status', s);
    if (q) u.set('q', q);
    if (p.page && p.page > 1) u.set('page', String(p.page));
    const qs = u.toString();
    return `/payouts${qs ? `?${qs}` : ''}`;
  };
  const k = d?.kpis;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Payouts</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/royalties">
              Author earnings
            </Link>
            <Link className="ib" href="/exports" aria-label="Export payouts">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        {k && (
          <div className="kpis">
            <div className="kpi">
              <span className="kpi__l">{k.paid_on ? `Paid on ${day(k.paid_on)}` : 'Paid'}</span>
              <span className="kpi__v">{naira(k.paid_kobo)}</span>
              <span className="kpi__d">{`${n0(k.paid_count)} successful transfer${k.paid_count === 1 ? '' : 's'}`}</span>
            </div>
            <div className="kpi">
              <span className="kpi__l">Failed</span>
              <span className="kpi__v">{naira(k.failed_kobo)}</span>
              <span className="kpi__d">{`${n0(k.failed_count)} transfer${k.failed_count === 1 ? '' : 's'} to retry`}</span>
            </div>
            <div className="kpi">
              <span className="kpi__l">Pending</span>
              <span className="kpi__v">{n0(k.pending_count)}</span>
              <span className="kpi__d">{k.pending_count ? `${naira(k.pending_kobo)} on its way` : 'Nothing waiting'}</span>
            </div>
            <div className="kpi">
              <span className="kpi__l">Flutterwave balance</span>
              <span className="kpi__v">{balance == null ? 'Not read' : naira(balance)}</span>
              <span className="kpi__d">
                {k.releasing_kobo ? `Next release needs ${naira(k.releasing_kobo)}` : 'No release waiting'}
              </span>
            </div>
          </div>
        )}
        <div className="toolbar">
          <form action="/payouts" method="get" style={{ display: 'contents' }}>
            {status && <input type="hidden" name="status" value={status} />}
            <label className="search">
              <Icon name="search" size="s" />
              <input name="q" defaultValue={q} placeholder="Author or reference" aria-label="Search payouts" />
            </label>
          </form>
          <ToastButton className="fbtn" label="Filters" message="Use the status chips and search to narrow the transfers." />
          <Chips
            items={[
              { href: href({ status: null }), label: 'All', on: !status },
              { href: href({ status: 'successful' }), label: 'Successful', on: status === 'successful' },
              { href: href({ status: 'pending' }), label: 'Pending', count: d?.counts.pending || undefined, on: status === 'pending' },
              { href: href({ status: 'failed' }), label: 'Failed', count: d?.counts.failed || undefined, on: status === 'failed' },
              { href: href({ status: 'reversed' }), label: 'Reversed', count: d?.counts.reversed || undefined, on: status === 'reversed' },
            ]}
          />
        </div>
        <div className="panel panel--flush">
          {error || !d ? (
            <Empty title="Payouts didn't load" text="Nothing changed. Reload the page to try again." />
          ) : d.rows.length === 0 ? (
            <Empty
              title={q || status ? 'No transfers match' : 'No payouts yet'}
              text={
                q || status
                  ? 'Clear the search or choose All to see every transfer.'
                  : 'Each Flutterwave transfer to an author shows here once a month is released.'
              }
            />
          ) : (
            <>
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Author</th>
                      <th>Month</th>
                      <th className="r">Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th className="acts"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map(p => {
                      const cells = <PayoutCells p={p} />;
                      return p.can_retry ? (
                        <RowLink key={p.id} href={`/payouts/${p.id}/retry`}>
                          {cells}
                        </RowLink>
                      ) : (
                        <tr key={p.id}>{cells}</tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={page} shown={d.rows.length} total={d.total} noun="transfers" href={p => href({ page: p })} />
            </>
          )}
        </div>
      </div>
      {sp.done && <Flash msg={sp.done} />}
    </section>
  );
}

function PayoutCells({ p }: { p: PayoutRow }) {
  const bank = p.bank_name ? `${p.bank_name} ••••${p.account_last4}` : p.waiting_for_account ? 'Waiting for an account' : '';
  const ref = p.flutterwave_transfer_id ? `${p.reference} · FLW ${p.flutterwave_transfer_id}` : p.reference;
  const when = p.settled_at ?? p.sent_at ?? p.queued_at;
  return (
    <>
      <td>
        <div className="who">
          <span>
            <b>{p.name}</b>
            <small>
              {bank && `${bank} · `}
              <span className="mn-id">{ref}</span>
            </small>
          </span>
        </div>
      </td>
      <td>{monthLabel(p.month, { short: true })}</td>
      <td className="n">{naira(p.amount_kobo)}</td>
      <td>
        {p.status === 'failed' ? (
          <span className="st st-err">Failed</span>
        ) : p.status === 'pending' || p.status === 'queued' ? (
          <span className="st st-warn">{p.status === 'queued' ? 'Queued' : 'Pending'}</span>
        ) : (
          <span className="st-plain">{p.status === 'successful' ? 'Successful' : 'Reversed'}</span>
        )}
        {p.failure_reason && (p.status === 'failed' || p.status === 'reversed') && (
          <>
            <br />
            <small className="muted">{p.failure_reason}</small>
          </>
        )}
      </td>
      <td className="nw">{day(when)}</td>
      <td className="acts">
        {p.can_retry && (
          <Link className="btn btn-s sm" href={`/payouts/${p.id}/retry`}>
            Retry
          </Link>
        )}
      </td>
    </>
  );
}
