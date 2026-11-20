import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { CommunityView, type ChannelRow, type CommunityStats } from './community-view';

export const metadata: Metadata = { title: 'Community · Arpedia Admin' };

/** s-community: official, club, author and read-along channels with 7-day activity and reports. */
export default async function CommunityPage() {
  const staff = await requireStaff();
  if (!canOpen('community', staff.permissions))
    return <NoAccess page="community" label="Community" role={staff.role} />;
  const supabase = await serverSupabase();
  const [list, stats] = await Promise.all([
    supabase.rpc('admin_list_channels', {}),
    supabase.rpc('admin_community_stats'),
  ]);
  const rows: ChannelRow[] = (list.data ?? []).map(r => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    ownerName: r.owner_name,
    whoCanPost: r.who_can_post,
    slowMode: r.slow_mode_seconds,
    members: r.member_count,
    messages7d: r.messages_7d,
    openReports: r.open_reports,
    status: r.status as ChannelRow['status'],
  }));
  return (
    <CommunityView
      rows={rows}
      stats={(stats.data as unknown as CommunityStats | null) ?? null}
      failed={!!list.error}
      canEdit={['super_admin', 'operations_admin', 'moderator'].includes(staff.role)}
    />
  );
}
