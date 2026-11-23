import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { BannersView } from './banners-view';
import type { Banner } from './labels';

export const metadata: Metadata = { title: 'In-app announcements · Arpedia Admin' };

/** s-banners: Home top, Credits page and launch modal announcements with shown and taps. */
export default async function BannersPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const staff = await requireStaff();
  if (!canOpen('banners', staff.permissions) && !staff.permissions.includes('view_analytics'))
    return <NoAccess page="banners" label="In-app announcements" role={staff.role} />;
  const supabase = await serverSupabase();
  const [list, genres] = await Promise.all([
    supabase.rpc('staff_list_banners'),
    supabase.from('genres').select('id, name'),
  ]);
  return (
    <BannersView
      rows={list.error ? null : ((list.data as unknown as Banner[] | null) ?? [])}
      genres={Object.fromEntries((genres.data ?? []).map(g => [g.id, g.name]))}
      canEdit={staff.permissions.includes('send_push')}
      done={done?.slice(0, 200)}
    />
  );
}
