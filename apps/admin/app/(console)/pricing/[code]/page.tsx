import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { loadPricing } from '../data';
import { PricingBody } from '../pricing-view';
import { PlanEditModal } from './client';

export const metadata: Metadata = { title: 'Edit plan · Arpedia Admin' };

/** s-plan-edit: the modal over Plans and pricing. Super admin and Finance only. */
export default async function PlanEditPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const staff = await requireStaff();
  if (!canOpen('pricing', staff.permissions)) return <NoAccess page="pricing" label="Plans and pricing" role={staff.role} />;
  const { plans, rules } = await loadPricing();
  const plan = plans.find(p => p.code === code);
  if (!plan || !rules) notFound();
  const supabase = await serverSupabase();
  const { count } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_code', plan.code)
    .in('status', ['active', 'grace', 'billing_retry', 'paused', 'cancelled']);
  return (
    <>
      <PricingBody />
      <PlanEditModal
        plan={plan}
        subscribers={count ?? 0}
        authorRateKobo={rules.author_rate_kobo}
        storeFeePct={rules.store_fee_pct}
        canEdit={staff.role === 'super_admin' || staff.role === 'finance'}
        closeHref="/pricing"
      />
    </>
  );
}
