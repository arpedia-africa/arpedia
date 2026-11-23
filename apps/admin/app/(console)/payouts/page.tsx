import type { Metadata } from 'next';
import { PayoutsScreen, type PayoutsSearch } from './list';

export const metadata: Metadata = { title: 'Payouts · Arpedia Admin' };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<PayoutsSearch> }) {
  return <PayoutsScreen sp={await searchParams} />;
}
