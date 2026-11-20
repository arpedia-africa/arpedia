import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { ClaimView, type ClaimDetail } from './claim-view';

export const metadata: Metadata = { title: 'Claim · Arpedia Admin' };

/** s-claim: matching passages, evidence, the author's response and timeline, and the decision bar. */
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await requireStaff();
  if (!canOpen('claims', staff.permissions)) return <NoAccess page="claims" label="Copyright claims" role={staff.role} />;
  const supabase = await serverSupabase();
  const [detail, queue] = await Promise.all([
    supabase.rpc('admin_get_claim', { p_claim: id }),
    supabase.rpc('admin_list_claims', { p_status: 'open' }),
  ]);
  if (detail.error?.message.includes('not_found')) notFound();
  // Same order as the Open tab (newest first).
  const list = (queue.data ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const at = list.findIndex((c) => c.id === id);
  const next = list.find((c, i) => i > at && c.id !== id) ?? list.find((c) => c.id !== id) ?? null;
  return (
    <ClaimView
      detail={(detail.data as unknown as ClaimDetail | null) ?? null}
      failed={!!detail.error}
      position={at >= 0 ? at + 1 : null}
      total={list.length}
      next={next ? { id: next.id, ref: next.ref, waiting: next.status === 'waiting_on_author' } : null}
    />
  );
}
