import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { PoliciesView, type Policy } from './client';

export const metadata: Metadata = { title: 'Policies · Arpedia Admin' };

/** s-policies: versioned legal pages, the accept-again switch and the draft waiting to publish. */
export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const staff = await requireStaff();
  if (!canOpen('policies', staff.permissions))
    return <NoAccess page="policies" label="Policies and legal pages" role={staff.role} />;
  const { draft } = await searchParams;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('list_policies');
  if (error) throw error;
  return (
    <PoliciesView
      policies={(data ?? []) as unknown as Policy[]}
      open={draft ?? null}
      canEdit={staff.role === 'super_admin'}
    />
  );
}
