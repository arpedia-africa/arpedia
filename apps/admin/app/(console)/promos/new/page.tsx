import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { loadPricing } from '../../pricing/data';
import { NewPromoForm } from './client';

export const metadata: Metadata = { title: 'New promo code · Arpedia Admin' };

/** s-promo-new: code, what it gives, total uses and end date, with a reader preview. */
export default async function NewPromoPage() {
  const staff = await requireStaff();
  if (!canOpen('promos', staff.permissions)) return <NoAccess page="promos" label="Promo codes" role={staff.role} />;
  const { plans, rules } = await loadPricing();
  if (!rules) throw new Error('No pricing rules found');
  return (
    <NewPromoForm
      plan={plans.find(p => p.code === 'quarterly') ?? plans[0] ?? null}
      creditValueKobo={rules.credit_value_kobo}
      authorRateKobo={rules.author_rate_kobo}
    />
  );
}
