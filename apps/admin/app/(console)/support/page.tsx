import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { SupportView, type TicketCounts, type TicketPreview, type TicketRow, type TicketTab } from './support-view';

export const metadata: Metadata = { title: 'Support inbox · Arpedia Admin' };

const TABS: TicketTab[] = ['mine', 'unassigned', 'waiting', 'solved'];

/** s-support: tickets from email and the app, first reply within 1 day. */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ tab?: string; t?: string }> }) {
  const staff = await requireStaff();
  if (!canOpen('support', staff.permissions)) return <NoAccess page="support" label="Support inbox" role={staff.role} />;
  const sp = await searchParams;
  const supabase = await serverSupabase();
  const counts = (await supabase.rpc('admin_ticket_counts')).data as unknown as TicketCounts | null;
  // Default tab: Mine when something is assigned to you, else Unassigned.
  const tab: TicketTab = TABS.includes(sp.tab as TicketTab) ? (sp.tab as TicketTab) : counts?.mine ? 'mine' : 'unassigned';
  const list = await supabase.rpc('admin_list_tickets', { p_tab: tab, p_limit: 100 });
  const rows: TicketRow[] = (list.data ?? []).map(r => ({
    id: r.id,
    ref: r.ref,
    subject: r.subject,
    reader: r.reader_name ?? r.email ?? 'Unknown sender',
    category: r.category,
    status: r.status,
    dueAt: r.first_reply_due_at,
    repliedAt: r.first_replied_at,
  }));
  const selected = rows.find(r => r.id === sp.t) ?? rows[0];
  const preview = selected
    ? ((await supabase.rpc('admin_get_ticket', { p_ticket: selected.id })).data as unknown as TicketPreview | null)
    : null;
  return (
    <SupportView
      tab={tab}
      rows={rows}
      total={Number(list.data?.[0]?.total ?? 0)}
      counts={counts}
      selectedId={selected?.id ?? null}
      preview={preview}
      failed={!!list.error}
    />
  );
}
