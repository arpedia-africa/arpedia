import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { ExportsView, type ExportList } from './exports-view';

export const metadata: Metadata = { title: 'Exports and reports · Arpedia Admin' };

/** s-exports: background CSV exports for 7 days, the new export form and scheduled reports. */
export default async function ExportsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const staff = await requireStaff();
  const finance = staff.role === 'finance';
  if (!staff.permissions.includes('view_analytics') && !finance)
    return <NoAccess page="exports" label="Exports and reports" role={staff.role} />;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_list_exports');
  return (
    <ExportsView
      data={error ? null : ((data as unknown as ExportList | null) ?? { rows: [], schedules: [] })}
      role={staff.role}
      canPersonal={staff.permissions.includes('export_personal')}
      done={done?.slice(0, 200)}
    />
  );
}
