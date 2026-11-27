import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { ReportView, type ReportDetail } from './report-view';

export const metadata: Metadata = { title: 'Report · Arpedia Admin' };

/** s-report / s-report-review: the content in context, the reported user, reporters and checks. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await requireStaff();
  if (!canOpen('reports', staff.permissions))
    return <NoAccess page="reports" label="Reports" role={staff.role} />;
  const supabase = await serverSupabase();
  const [detail, queue, bans] = await Promise.all([
    supabase.rpc('admin_get_report', { p_report: id }),
    supabase.rpc('admin_list_reports', { p_tab: 'open', p_limit: 200 }),
    staff.role === 'super_admin' ? supabase.rpc('admin_pending_bans') : Promise.resolve({ data: [] }),
  ]);
  const ban = (bans.data ?? []).find((b) => b.report_id === id);
  if (detail.error?.message.includes('not_found')) notFound();
  const ids = (queue.data ?? []).map((r) => r.id);
  const at = ids.indexOf(id);
  return (
    <ReportView
      detail={(detail.data as unknown as ReportDetail | null) ?? null}
      failed={!!detail.error}
      position={at >= 0 ? at + 1 : null}
      total={ids.length}
      nextId={ids.find((x, i) => i > at && x !== id) ?? ids.find((x) => x !== id) ?? null}
      canDecide={['super_admin', 'operations_admin', 'moderator'].includes(staff.role)}
      pendingBan={
        ban ? { actionId: ban.action_id, decidedBy: ban.decided_by_name ?? 'A moderator', isMinor: !!ban.is_minor } : null
      }
    />
  );
}
