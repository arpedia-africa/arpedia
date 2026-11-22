import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { PricingBody } from './pricing-view';

export const metadata: Metadata = { title: 'Plans and pricing · Arpedia Admin' };

/** s-pricing: plans, top-ups, book prices and price history. Super admin and Finance (change_prices). */
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const staff = await requireStaff();
  if (!canOpen('pricing', staff.permissions)) return <NoAccess page="pricing" label="Plans and pricing" role={staff.role} />;
  const { flash } = await searchParams;
  return <PricingBody flash={flash?.slice(0, 200)} />;
}
