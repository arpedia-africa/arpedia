import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { TABS, TYPE_FILTERS, type ReportTab, type TypeFilter } from './labels';
import { ReportsView, type ReportCounts, type ReportRow } from './reports-view';

export const metadata: Metadata = { title: 'Reports · Arpedia Admin' };

/** s-reports: one queue for every reported item, severity then oldest first. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; type?: string }> }) {
  const staff = await requireStaff();
  if (!canOpen('reports', staff.permissions)) return <NoAccess page="reports" label="Reports" role={staff.role} />;
  const sp = await searchParams;
  const tab: ReportTab = TABS.some(t => t.key === sp.tab) ? (sp.tab as ReportTab) : 'open';
  const type: TypeFilter = TYPE_FILTERS.some(t => t.key === sp.type) ? (sp.type as TypeFilter) : 'all';
  const supabase = await serverSupabase();
  const [list, counts] = await Promise.all([
    supabase.rpc('admin_list_reports', { p_tab: tab, p_type: type === 'all' ? undefined : type, p_limit: 100 }),
    supabase.rpc('admin_report_counts'),
  ]);
  const rows: ReportRow[] = (list.data ?? []).map(r => ({
    id: r.id,
    ref: r.ref,
    type: r.content_type,
    quote: r.quote,
    place: r.place,
    author: r.author_name,
    reason: r.reason,
    severity: r.severity,
    reporters: r.reporters,
    createdAt: r.created_at,
    late: r.late,
    status: r.status,
    outcome: r.outcome,
    assignee: r.assignee_name,
    escalated: r.escalated,
    brigading: r.brigading,
  }));
  return (
    <ReportsView
      tab={tab}
      type={type}
      rows={rows}
      total={Number(list.data?.[0]?.total ?? 0)}
      counts={(counts.data as unknown as ReportCounts | null) ?? null}
      failed={!!list.error}
    />
  );
}
