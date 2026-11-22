import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { roomMessages } from '../actions';
import { RoomView, type RoomDetail } from './room-view';

export const metadata: Metadata = { title: 'Reading room · Arpedia Admin' };

/** s-room: staff view of a room (every open is audited by admin_get_room). */
export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ watch?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await requireStaff();
  if (!canOpen('community', staff.permissions) || !['super_admin', 'moderator'].includes(staff.role))
    return <NoAccess page="community" label="Reading rooms" role={staff.role} />;
  const supabase = await serverSupabase();
  const [{ data, error }, messages] = await Promise.all([
    supabase.rpc('admin_get_room', { p_room: id }),
    roomMessages(id),
  ]);
  if (error?.message.includes('not_found')) notFound();
  return (
    <RoomView
      detail={(data as unknown as RoomDetail | null) ?? null}
      messages={messages}
      failed={!!error}
      watching={sp.watch === '1'}
    />
  );
}
