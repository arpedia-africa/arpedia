import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { ChannelView, type ChannelDetail } from './channel-view';

export const metadata: Metadata = { title: 'Channel · Arpedia Admin' };

/** s-channel: settings staff change on behalf of the owner, flagged messages, members, pins. */
export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await requireStaff();
  if (!canOpen('community', staff.permissions))
    return <NoAccess page="community" label="Community" role={staff.role} />;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_get_channel', { p_group: id });
  if (error?.message.includes('not_found')) notFound();
  return (
    <ChannelView
      detail={(data as unknown as ChannelDetail | null) ?? null}
      failed={!!error}
      canEdit={['super_admin', 'operations_admin', 'moderator'].includes(staff.role)}
    />
  );
}
