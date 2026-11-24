import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { loadPricing } from '../data';
import { PricingBody } from '../pricing-view';
import { PlanEditModal } from './client';
import { ConfirmChangeModal } from './confirm';

export const metadata: Metadata = { title: 'Edit plan · Arpedia Admin' };

/**
 * s-plan-edit: the modal over Plans and pricing. Super admin and Finance only. With `?change=<id>`
 * a Super admin reviews a price change someone else proposed (rule 17) instead.
 */
export default async function PlanEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ change?: string }>;
}) {
  const { code } = await params;
  const { change } = await searchParams;
  const staff = await requireStaff();
  if (!canOpen('pricing', staff.permissions)) return <NoAccess page="pricing" label="Plans and pricing" role={staff.role} />;
  const { plans, rules, priceChanges } = await loadPricing();
  const plan = plans.find(p => p.code === code);
  if (!plan || !rules) notFound();
  const viewer = { id: staff.id, superAdmin: staff.role === 'super_admin' };
  const supabase = await serverSupabase();
  const { count } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_code', plan.code)
    .in('status', ['active', 'grace', 'billing_retry', 'paused', 'cancelled']);
  const pending = change ? priceChanges.find(c => c.id === change && c.plan_code === plan.code) : undefined;
  return (
    <>
      <PricingBody viewer={viewer} />
      {pending ? (
        <ConfirmChangeModal
          plan={plan}
          change={pending}
          subscribers={count ?? 0}
          canDecide={viewer.superAdmin && pending.requested_by !== staff.id}
          closeHref="/pricing"
        />
      ) : (
        <PlanEditModal
          plan={plan}
          subscribers={count ?? 0}
          authorRateKobo={rules.author_rate_kobo}
          storeFeePct={rules.store_fee_pct}
          canEdit={staff.role === 'super_admin' || staff.role === 'finance'}
          closeHref="/pricing"
        />
      )}
    </>
  );
}
