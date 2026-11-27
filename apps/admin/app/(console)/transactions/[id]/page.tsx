import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ledgerDate, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { PLATFORM, guard, n0, planName } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import TransactionsPage from '../page';
import { ResendReceipt } from '../receipt';

export const metadata: Metadata = { title: 'Transaction · Arpedia Admin' };

const STATUS: Record<string, string> = {
  succeeded: 'Succeeded',
  pending: 'Pending',
  refunded: 'Refunded',
  failed: 'Failed',
  disputed: 'Disputed',
};
const CHANNEL: Record<string, string> = { web: 'web checkout', play: 'Google Play', app_store: 'App Store' };
const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

/**
 * s-transaction, drawn over Transactions: amount, fee and net, credits granted, the provider's payment
 * notices under Technical details, and for web payments Resend receipt and Refund… (rule 31).
 */
export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { staff, denied } = await guard('transactions', 'Transactions');
  if (denied) return denied;

  const supabase = await serverSupabase();
  const { data: t, error } = await supabase
    .from('transactions')
    .select(
      `id, created_at, kind, plan_code, topup_code, store, store_txn_id, gross_kobo, fee_kobo, net_kobo, refunded_kobo,
       status, credits_granted, user_id, topup:topup_products(credits),
       user:profiles!transactions_user_id_fkey(full_name, username)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!t) notFound();

  const [events, refund] = await Promise.all([
    supabase
      .from('payment_events')
      .select('id, event_type, occurred_at, outcome, error')
      .eq('provider', t.store === 'web' ? 'flutterwave' : 'revenuecat')
      .eq('normalized->>txn_id', t.store_txn_id)
      .order('occurred_at')
      .limit(20),
    supabase
      .from('refund_requests')
      .select('id')
      .eq('transaction_id', t.id)
      .order('requested_at', { ascending: false })
      .limit(1),
  ]);

  const name = t.user?.full_name || (t.user?.username ? `@${t.user.username}` : 'Reader');
  const web = t.store === 'web';
  const paid = t.status === 'succeeded' || t.status === 'refunded' || t.status === 'disputed';
  const unpaid = t.status === 'failed' || t.status === 'pending';
  const fee = unpaid ? 0 : t.fee_kobo;
  const net = unpaid ? 0 : Math.max(0, (t.net_kobo ?? t.gross_kobo - t.fee_kobo) - t.refunded_kobo);
  const feePct = t.gross_kobo && fee ? Math.round((fee / t.gross_kobo) * 1000) / 10 : null;
  const feeLabel = `${web ? 'Flutterwave' : (PLATFORM[t.store] ?? 'Store')} fee${feePct !== null ? ` (${feePct}%)` : ''}`;
  const title = t.kind === 'topup' ? `${n0(t.topup?.credits ?? t.credits_granted)} credits` : planName(t.plan_code);
  const item =
    t.kind === 'topup'
      ? `Top-up · ${web ? 'web price' : (PLATFORM[t.store] ?? t.store)}`
      : `${planName(t.plan_code)} plan · ${web ? 'web price' : (PLATFORM[t.store] ?? t.store)}`;
  const canResend = web && paid && (staff.role === 'finance' || staff.role === 'super_admin');
  const refundId = web ? refund.data?.[0]?.id : undefined;
  const notices = events.data ?? [];

  return (
    <>
      <TransactionsPage searchParams={Promise.resolve({})} />
      <section className="screen overlay enter">
        <Link className="backdrop" href="/transactions" aria-label="Close"></Link>
        <div className="drawer" role="dialog" aria-label={`Transaction ${t.store_txn_id}`}>
          <div className="modal__h">
            <div className="grow">
              <h2>{`${naira(t.gross_kobo)} ${title}`}</h2>
              <p>{[STATUS[t.status] ?? t.status, name, CHANNEL[t.store] ?? t.store, ledgerDate(t.created_at)].join(' · ')}</p>
            </div>
            <Link className="ib" href="/transactions" aria-label="Close">
              <Icon name="x" />
            </Link>
          </div>
          <div className="modal__b">
            <dl className="kv">
              <dt>Reader</dt>
              <dd>
                <Link className="link" href={`/users/${t.user_id}`}>
                  {name}
                </Link>
              </dd>
              <dt>Item</dt>
              <dd>{item}</dd>
              <dt>Amount</dt>
              <dd>{naira(t.gross_kobo)}</dd>
              <dt>{feeLabel}</dt>
              <dd>{naira(fee)}</dd>
              {t.refunded_kobo > 0 && (
                <>
                  <dt>Refunded</dt>
                  <dd>{naira(t.refunded_kobo)}</dd>
                </>
              )}
              <dt>Net to Arpedia</dt>
              <dd>
                <b>{naira(net)}</b>
              </dd>
              <dt>Credits</dt>
              <dd>
                {`${n0(t.credits_granted)} granted · `}
                <Link className="link" href={`/credits/${t.user_id}`}>
                  ledger
                </Link>
              </dd>
            </dl>
            <details className="fold">
              <summary>
                Technical details <small>reference, payment notices</small>
              </summary>
              <div className="fold__b">
                <dl className="kv">
                  <dt>{web ? 'Flutterwave transaction' : 'Store transaction'}</dt>
                  <dd>
                    <span className="mono">{t.store_txn_id}</span>
                  </dd>
                </dl>
                <span className="mn-fold-h">{`Payment notices from ${web ? 'Flutterwave' : 'RevenueCat'}`}</span>
                {notices.length ? (
                  <div className="tl">
                    {notices.map((e, i) => (
                      <div className={`tl__i ${e.error ? 'err' : 'ok'}`} key={e.id}>
                        <b>{`${ORDINAL[i] ?? `Notice ${i + 1}`}${ORDINAL[i] ? ' notice' : ''} · ${ledgerDate(e.occurred_at)}`}</b>
                        <small>{e.error ? `Problem: ${e.error}` : (e.outcome ?? e.event_type)}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted">
                    {staff.role === 'finance' || staff.role === 'super_admin'
                      ? 'No payment notices recorded for this payment.'
                      : 'Payment notices are visible to Finance and Super admins.'}
                  </span>
                )}
              </div>
            </details>
          </div>
          {(canResend || refundId) && (
            <div className="modal__f">
              {canResend && <ResendReceipt transactionId={t.id} name={name} />}
              {refundId && (
                <Link className="btn btn-d" href={`/refunds/${refundId}`}>
                  Refund…
                </Link>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
