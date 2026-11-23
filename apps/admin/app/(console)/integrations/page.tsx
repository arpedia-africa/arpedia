import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { IntegrationsView, type Integration } from './client';

export const metadata: Metadata = { title: 'Integrations · Arpedia Admin' };

/** s-integrations: health per outside service (checked every minute), masked keys and rotation. */
export default async function IntegrationsPage() {
  const staff = await requireStaff();
  if (!canOpen('integrations', staff.permissions))
    return <NoAccess page="integrations" label="Integrations" role={staff.role} />;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('list_integrations');
  if (error) throw error;
  return (
    <IntegrationsView
      services={(data ?? []) as unknown as Integration[]}
      canRotate={staff.role === 'super_admin'}
    />
  );
}
