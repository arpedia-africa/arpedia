import { notFound } from 'next/navigation';
import { naira } from '@arpedia/core';
import { guard } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { dayTime, monthLabel, past } from '../../../royalties/shared';
import { PayoutsScreen } from '../../list';
import { RetryModal } from './client';

interface Account {
  id: string;
  bank_name: string;
  last4: string;
  status: string;
  bank_account_name?: string;
  created_at?: string;
  payouts_resume_at?: string;
}
interface Payout {
  id: string;
  name: string;
  month: string;
  amount_kobo: number;
  reference: string;
  flutterwave_transfer_id: string | null;
  failure_reason: string | null;
  status: string;
  can_retry: boolean;
  legal_name: string | null;
  account: Account | null;
  current: Account | null;
}

/** s-payout-retry, drawn over Payouts. */
export default async function RetryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { denied } = await guard('payouts', 'Payouts');
  if (denied) return denied;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_payout', { p_payout: id });
  if (error) {
    if (error.message === 'not_found' || error.code === '22P02') notFound();
    throw error;
  }
  const p = data as unknown as Payout;
  if (!p.can_retry) notFound();
  const newer = p.current && p.current.id !== p.account?.id ? p.current : null;

  return (
    <>
      <PayoutsScreen sp={{}} />
      <RetryModal
        id={p.id}
        name={p.name}
        amount={naira(p.amount_kobo)}
        amountKobo={p.amount_kobo}
        sub={`${monthLabel(p.month)} earnings · ${p.flutterwave_transfer_id ? `FLW ${p.flutterwave_transfer_id}` : p.reference}`}
        why={p.failure_reason ?? (p.status === 'reversed' ? 'The bank returned the transfer.' : 'Flutterwave didn’t say why.')}
        onFile={p.account ? `${p.account.bank_name} ••••${p.account.last4}` : 'No account'}
        bankName={p.account?.bank_account_name ?? null}
        legalName={p.legal_name}
        newer={
          newer
            ? {
                label: `${newer.bank_name} ••••${newer.last4}${newer.created_at ? `, ${dayTime(newer.created_at).split(',')[0]}` : ''}`,
                status: newer.status === 'verified' ? 'verified' : 'needs review',
                href: `/bank-accounts/${newer.id}`,
                resume: newer.payouts_resume_at && !past(newer.payouts_resume_at) ? dayTime(newer.payouts_resume_at) : null,
              }
            : null
        }
        sameAllowed={p.current?.status === 'verified'}
      />
    </>
  );
}
