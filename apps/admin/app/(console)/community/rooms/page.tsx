import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { RoomsView, type RoomCounts, type RoomRow, type RoomTab } from './rooms-view';

export const metadata: Metadata = { title: 'Reading rooms · Arpedia Admin' };

const TABS: RoomTab[] = ['live', 'scheduled', 'ended'];

/** s-rooms: live, scheduled and recently ended reading rooms (flow 07). */
export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const staff = await requireStaff();
  if (!canOpen('community', staff.permissions))
    return <NoAccess page="community" label="Community" role={staff.role} />;
  const tab: RoomTab = TABS.includes(sp.tab as RoomTab) ? (sp.tab as RoomTab) : 'live';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const supabase = await serverSupabase();
  const [counts, stats, ...lists] = await Promise.all([
    supabase.rpc('admin_room_counts'),
    supabase.rpc('admin_community_stats'),
    ...TABS.map(t => supabase.rpc('admin_list_rooms', { p_tab: t, p_q: q || undefined, p_limit: 50 })),
  ]);
  const rows = Object.fromEntries(
    TABS.map((t, i) => [
      t,
      (lists[i]?.data ?? []).map(
        (r): RoomRow => ({
          id: r.room_id,
          name: r.name,
          book: r.book_title,
          host: r.host_name,
          members: r.member_count,
          live: r.live_count,
          startsAt: r.starts_at,
          endedAt: r.ended_at,
          code: r.code,
          reports: r.open_reports,
          total: Number(r.total),
        }),
      ),
    ]),
  ) as Record<RoomTab, RoomRow[]>;
  return (
    <RoomsView
      tab={tab}
      q={q}
      rows={rows}
      counts={(counts.data as unknown as RoomCounts | null) ?? null}
      channels={(stats.data as unknown as { channels?: number } | null)?.channels ?? null}
      failed={!!counts.error || lists.some(l => !!l.error)}
      canAct={['super_admin', 'moderator'].includes(staff.role)}
    />
  );
}
