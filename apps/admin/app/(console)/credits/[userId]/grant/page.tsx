import { notFound } from 'next/navigation';
import { guard } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { LedgerScreen } from '../ledger';
import { GrantModal } from './client';

/** s-user-grant, drawn over the reader's ledger: Grant credits. Up to 500 applies, over 500 asks a second approver. */
export default async function GrantPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { denied } = await guard('credits', 'Credits');
  if (denied) return denied;
  const supabase = await serverSupabase();
  const [profile, balances] = await Promise.all([
    supabase.from('profiles').select('full_name, username').eq('id', userId).maybeSingle(),
    supabase.from('credit_balances').select('plan, rollover, topup, promo').eq('user_id', userId).maybeSingle(),
  ]);
  if (!profile.data) notFound();
  const b = balances.data;
  return (
    <>
      <LedgerScreen userId={userId} />
      <GrantModal
        userId={userId}
        name={profile.data.full_name || (profile.data.username ? `@${profile.data.username}` : 'Reader')}
        balance={b ? b.plan + b.rollover + b.topup + b.promo : 0}
      />
    </>
  );
}
