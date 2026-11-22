import { notFound } from 'next/navigation';
import { naira, refundRecommendation } from '@arpedia/core';
import { dayMonth, guard, planName } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { RefundsScreen } from '../list';
import { RefundModal } from './client';

/** s-refund, drawn over the refund requests: Refund (full or partial) or Decline. */
export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { denied } = await guard('refunds', 'Refunds');
  if (denied) return denied;
  const supabase = await serverSupabase();
  const { data: r, error } = await supabase
    .from('refund_requests')
    .select(
      `id, reason, requested_at, credits_granted, credits_used, recommendation, status, type, amount_kobo,
       tx:transactions!refund_requests_transaction_id_fkey(plan_code, kind, gross_kobo, fee_kobo, created_at, credits_granted),
       user:profiles!refund_requests_user_id_fkey(full_name, username)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!r || !r.tx) notFound();

  const name = r.user?.full_name || (r.user?.username ? `@${r.user.username}` : 'the reader');
  const days = Math.max(0, Math.floor((new Date(r.requested_at).getTime() - new Date(r.tx.created_at).getTime()) / 86_400_000));
  // Our own rule (rule 32) next to what the server stored, so a disagreement is visible.
  const rule = refundRecommendation(days, r.credits_granted, r.credits_used);
  const pct = Math.round((r.credits_used / Math.max(r.credits_granted, 1)) * 100);
  const item = r.tx.kind === 'topup' ? 'Top-up' : `${planName(r.tx.plan_code)} plan`;

  return (
    <>
      <RefundsScreen />
      <RefundModal
        id={r.id}
        name={name}
        status={r.status}
        grossKobo={r.tx.gross_kobo}
        feeKobo={r.tx.fee_kobo}
        granted={r.credits_granted}
        used={r.credits_used}
        recommendation={r.recommendation}
        agrees={rule === r.recommendation || r.recommendation === 'duplicate'}
        reason={r.reason}
        days={days}
        pct={pct}
        bought={`${item} · web checkout · bought ${dayMonth(r.tx.created_at)}, ${days === 0 ? 'the same day' : `${days} day${days === 1 ? '' : 's'} later`}`}
        refunded={r.amount_kobo ? naira(r.amount_kobo) : ''}
      />
    </>
  );
}
