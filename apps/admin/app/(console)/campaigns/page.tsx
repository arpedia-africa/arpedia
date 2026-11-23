import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { CampaignsView, type CampaignList } from './campaigns-view';

export const metadata: Metadata = { title: 'Push notifications · Arpedia Admin' };

/** s-campaigns: sent, scheduled and draft pushes with four numbers, and the automatic notifications. */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const staff = await requireStaff();
  const drafter = staff.role === 'publisher' || staff.role === 'moderator';
  if (!canOpen('campaigns', staff.permissions) && !drafter && !staff.permissions.includes('view_analytics'))
    return <NoAccess page="campaigns" label="Push notifications" role={staff.role} />;
  const supabase = await serverSupabase();
  const [list, genres] = await Promise.all([
    supabase.rpc('staff_list_campaigns', { p_tab: 'all' }),
    supabase.from('genres').select('id, name'),
  ]);
  return (
    <CampaignsView
      data={(list.data as unknown as CampaignList | null) ?? null}
      genres={Object.fromEntries((genres.data ?? []).map(g => [g.id, g.name]))}
      canSend={staff.permissions.includes('send_push')}
      canDraft={staff.permissions.includes('send_push') || drafter}
      done={done?.slice(0, 200)}
    />
  );
}
