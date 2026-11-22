import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { AppealsView, type AppealRow } from './appeals-view';

export const metadata: Metadata = { title: 'Appeals · Arpedia Admin' };

/** s-appeals: Open (new + in review, oldest first) and Decided. */
export default async function AppealsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff();
  if (!canOpen('appeals', staff.permissions)) return <NoAccess page="appeals" label="Appeals" role={staff.role} />;
  const tab = (await searchParams).tab === 'decided' ? 'decided' : 'open';
  const supabase = await serverSupabase();
  const [open, decided] = await Promise.all([
    supabase.rpc('admin_list_appeals', { p_status: 'open' }),
    supabase.rpc('admin_list_appeals', { p_status: 'decided' }),
  ]);
  const list = tab === 'open' ? open : decided;
  const rows: AppealRow[] = (list.data ?? []).map((a) => ({
    id: a.id,
    name: a.user_name,
    subject: a.subject_type,
    decision: a.original_decision,
    decider: a.original_decider_name,
    createdAt: a.created_at,
    late: a.late,
    status: a.status,
  }));
  return (
    <AppealsView
      tab={tab}
      rows={tab === 'decided' ? rows.reverse() : rows}
      counts={{ open: open.data?.length ?? 0, decided: decided.data?.length ?? 0 }}
      failed={!!list.error}
    />
  );
}
