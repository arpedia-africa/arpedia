import type { Metadata } from 'next';
import { LedgerScreen } from './ledger';

export const metadata: Metadata = { title: 'Reader credits · Arpedia Admin' };

/** s-user-credits: one reader's full credit ledger. */
export default async function UserCreditsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ type?: string; done?: string }>;
}) {
  const [{ userId }, { type, done }] = await Promise.all([params, searchParams]);
  return <LedgerScreen userId={userId} type={type} done={done} />;
}
