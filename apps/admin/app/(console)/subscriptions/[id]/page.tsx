import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ledgerDate, ledgerDay, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { PLATFORM, guard, n0, planName } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { ExtendPanel, SubscriptionActions } from './client';

export const metadata: Metadata = { title: 'Subscription · Arpedia Admin' };

const STATUS: Record<string, string> = {
  active: 'Active',
  grace: 'In grace period',
  billing_retry: 'Billing retry',
  paused: 'Paused',
  cancelled: 'Cancelled',
  expired: 'Expired',
  refunded: 'Refunded',
};
const PER: Record<string, string> = { monthly: 'month', quarterly: 'quarter', yearly: 'year' };

// What a payment event says, in plain words; `bad` ones get the red dot.
const EVENT: Record<string, { label: string; bad?: boolean }> = {
  initial_purchase: { label: 'First purchase' },
  renewal: { label: 'Renewed' },
  topup: { label: 'Top-up' },
  cancellation: { label: 'Cancelled', bad: true },
  uncancellation: { label: 'Cancellation undone' },
  expiration: { label: 'Expired', bad: true },
  billing_issue: { label: 'Card declined', bad: true },
  billing_recovered: { label: 'Payment recovered' },
  product_change: { label: 'Plan changed' },
  pause: { label: 'Paused' },
  resume: { label: 'Resumed' },
  refund: { label: 'Refunded', bad: true },
  chargeback: { label: 'Chargeback', bad: true },
};

interface Normalized {
  type?: string;
  gross_kobo?: number;
  period_end?: string;
}

/** Subscription (s-subscription): plan, price and credits, store ids and purchase events, and Extend by 7, 14 or 30 days. */
export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { staff, denied } = await guard('subscriptions', 'Subscriptions');
  if (denied) return denied;

  const supabase = await serverSupabase();
  const { data: s, error } = await supabase
    .from('subscriptions')
    .select(
      `id, user_id, plan_code, store, status, auto_renew, period_start, period_end, created_at, store_original_txn_id,
       user:profiles!subscriptions_user_id_fkey(full_name, username, created_at)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!s) notFound();

  const [plan, balances, grants, txns, events] = await Promise.all([
    supabase.from('plans').select('name, credits, bonus_credits, price_play_kobo, price_web_kobo, play_product_id').eq('code', s.plan_code).maybeSingle(),
    supabase.from('credit_balances').select('plan, rollover, topup, promo').eq('user_id', s.user_id).maybeSingle(),
    supabase
      .from('credit_ledger')
      .select('id, delta, created_at')
      .eq('user_id', s.user_id)
      .eq('reason', 'plan_grant')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('transactions')
      .select('id, status, gross_kobo, fee_kobo, created_at')
      .eq('subscription_id', s.id)
      .eq('kind', 'plan')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('payment_events')
      .select('id, event_type, occurred_at, normalized, outcome, error')
      .eq('normalized->>original_txn_id', s.store_original_txn_id ?? '')
      .order('occurred_at')
      .limit(100),
  ]);
  if (grants.error) throw grants.error;

  const name = s.user?.full_name || (s.user?.username ? `@${s.user.username}` : 'Reader');
  const first = name.split(' ')[0]!;
  const p = plan.data;
  const credits = p ? p.credits + p.bonus_credits : 0;
  const price = p ? (s.store === 'web' ? p.price_web_kobo : p.price_play_kobo) : 0;
  const paid = txns.data?.[0];
  const feePct = paid && paid.gross_kobo ? Math.round((paid.fee_kobo / paid.gross_kobo) * 1000) / 10 : null;
  const b = balances.data;
  const balance = b ? b.plan + b.rollover + b.topup + b.promo : 0;
  const granted = grants.data.reduce((n, g) => n + g.delta, 0);
  const live = s.status === 'active' || s.status === 'grace' || s.status === 'billing_retry';
  const store = PLATFORM[s.store] ?? s.store;
  const canExtend = staff.role === 'finance' || staff.role === 'super_admin';
  const timeline = events.data ?? [];
  // Resend receipt (rule 33): web plans only, for the latest payment that went through.
  const receiptTx =
    s.store === 'web' && canExtend && paid && ['succeeded', 'refunded', 'disputed'].includes(paid.status) ? paid.id : null;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/subscriptions">Subscriptions</Link>
          <Icon name="chev" size="s" />
          <span>{name}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>{`${name}, ${planName(s.plan_code)}`}</h1>
            <div className="ph__meta">
              {[
                STATUS[s.status] ?? s.status,
                store,
                `${live && s.auto_renew ? 'renews' : 'ends'} ${ledgerDay(s.period_end)}`,
                price ? `${naira(price)} per ${PER[s.plan_code] ?? 'period'}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {receiptTx && (
            <div className="ph__acts">
              <SubscriptionActions transactionId={receiptTx} name={name} />
            </div>
          )}
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Subscription</h2>
              </div>
              <div className="panel__body">
                <dl className="kv">
                  <dt>Reader</dt>
                  <dd>
                    <Link className="link" href={`/users/${s.user_id}`}>
                      {name}
                    </Link>
                    {s.user?.created_at ? ` · joined ${ledgerDay(s.user.created_at)}` : ''}
                  </dd>
                  <dt>Plan</dt>
                  <dd>{`${planName(s.plan_code)} · ${n0(credits)} credits per period`}</dd>
                  <dt>Started</dt>
                  <dd>{`${ledgerDay(s.created_at)} · auto-renew ${s.auto_renew ? 'on' : 'off'}`}</dd>
                  <dt>Price paid</dt>
                  <dd>
                    {paid
                      ? `${naira(paid.gross_kobo)} · Arpedia receives ${naira(paid.gross_kobo - paid.fee_kobo)}${feePct !== null ? ` after the ${feePct}% fee` : ''}`
                      : price
                        ? `${naira(price)} · no payment recorded yet`
                        : '—'}
                  </dd>
                  <dt>Credits</dt>
                  <dd>
                    {`${n0(granted)} granted from this plan · `}
                    <Link className="link" href={`/credits/${s.user_id}`}>
                      {`${n0(balance)} credits`}
                    </Link>
                    {' in balance'}
                  </dd>
                </dl>
                {s.store !== 'web' && (
                  <span className="muted">
                    {`This is a ${store} subscription, so only ${s.store === 'play' ? 'Google' : 'Apple'} can refund it and ${first} cancels it in ${store}. If ${s.store === 'play' ? 'Google' : 'Apple'} refunds it, Arpedia is told automatically and unused credits are clawed back.`}
                  </span>
                )}
              </div>
            </div>
            <details className="fold">
              <summary>
                Technical details <small>store ids, purchase events</small>
              </summary>
              <div className="fold__b">
                <dl className="kv">
                  <dt>Product id</dt>
                  <dd>
                    <span className="mono">{s.store === 'web' ? 'Web checkout' : (p?.play_product_id ?? '—')}</span>
                  </dd>
                  <dt>Original transaction</dt>
                  <dd>
                    <span className="mono">{s.store_original_txn_id ?? '—'}</span>
                  </dd>
                  <dt>Credits by period</dt>
                  <dd>
                    {grants.data.length
                      ? [...grants.data].reverse().map(g => `${ledgerDay(g.created_at)} ${n0(g.delta)}`).join(' · ')
                      : 'No plan credits granted yet'}
                  </dd>
                </dl>
                <span className="mn-fold-h">Store purchase events</span>
                {timeline.length || live ? (
                  <div className="tl">
                    {timeline.map(e => {
                      const n = (e.normalized ?? {}) as Normalized;
                      const info: { label: string; bad?: boolean } = EVENT[n.type ?? ''] ?? { label: e.event_type };
                      const detail = [
                        n.gross_kobo ? naira(n.gross_kobo) : '',
                        e.error ? `Problem: ${e.error}` : e.outcome ?? '',
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <div className={`tl__i ${info.bad || e.error ? 'err' : 'ok'}`} key={e.id}>
                          <b>
                            {`${info.label} · ${ledgerDate(e.occurred_at)} `}
                            <span className="mono muted">{e.event_type}</span>
                          </b>
                          {detail && <small>{detail}</small>}
                        </div>
                      );
                    })}
                    {live && s.auto_renew && (
                      <div className="tl__i org">
                        <b>{`Next renewal · ${ledgerDay(s.period_end)}`}</b>
                        <small>{`Scheduled by ${store}.`}</small>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="muted">
                    {staff.role === 'finance' || staff.role === 'super_admin'
                      ? 'No purchase events recorded for this subscription yet.'
                      : 'Purchase events are visible to Finance and Super admins.'}
                  </span>
                )}
              </div>
            </details>
          </div>
          <div className="stack s20">
            <ExtendPanel id={s.id} name={name} canExtend={canExtend} />
          </div>
        </div>
      </div>
    </section>
  );
}
