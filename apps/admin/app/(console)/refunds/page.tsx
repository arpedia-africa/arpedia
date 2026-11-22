import type { Metadata } from 'next';
import { RefundsScreen } from './list';

export const metadata: Metadata = { title: 'Refunds · Arpedia Admin' };

/** s-refunds: refund requests for web payments. */
export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ status?: string; done?: string }> }) {
  const { status, done } = await searchParams;
  return <RefundsScreen group={status} done={done} />;
}
