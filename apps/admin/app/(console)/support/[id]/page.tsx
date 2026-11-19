import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { TicketView, type Macro, type TicketDetail } from './ticket-view';

export const metadata: Metadata = { title: 'Ticket · Arpedia Admin' };

/** s-ticket: the conversation, internal notes, macros and the reader's plan and credits. */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const staff = await requireStaff();
  if (!canOpen('support', staff.permissions)) return <NoAccess page="support" label="Support inbox" role={staff.role} />;
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_get_ticket', { p_ticket: id });
  if (error?.code === 'P0002') notFound();
  const detail = data as unknown as TicketDetail | null;
  // "Ticket N of M" and Skip walk the inbox tab the ticket was opened from (default: Mine, else Unassigned).
  const tab = ['mine', 'unassigned', 'waiting', 'solved'].includes(sp.tab ?? '')
    ? sp.tab!
    : detail?.ticket.assignee_id === staff.id
      ? 'mine'
      : 'unassigned';
  const [queue, macros] = await Promise.all([
    supabase.rpc('admin_list_tickets', { p_tab: tab, p_limit: 100 }),
    supabase.from('support_macros').select('id, title, body, category').order('title'),
  ]);
  const ids = (queue.data ?? []).map(r => r.id);
  const at = ids.indexOf(id);
  return (
    <TicketView
      detail={detail}
      failed={!!error}
      meId={staff.id}
      meName={staff.name}
      tab={tab}
      position={at >= 0 ? { n: at + 1, of: Number(queue.data?.[0]?.total ?? ids.length) } : null}
      nextId={at >= 0 ? (ids[at + 1] ?? null) : (ids[0] ?? null)}
      macros={(macros.data ?? []) as Macro[]}
    />
  );
}
