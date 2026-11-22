import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { ClaimsView, type ClaimRow } from './claims-view';
import type { ClaimTab } from './labels';

export const metadata: Metadata = { title: 'Copyright claims · Arpedia Admin' };

/** s-claims: Open (new and waiting, newest first), Waiting on author, Decided. */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff();
  if (!canOpen('claims', staff.permissions))
    return <NoAccess page="claims" label="Copyright claims" role={staff.role} />;
  const t = (await searchParams).tab;
  const tab: ClaimTab = t === 'waiting' || t === 'decided' ? t : 'open';
  const supabase = await serverSupabase();
  const [open, decided] = await Promise.all([
    supabase.rpc('admin_list_claims', { p_status: 'open' }),
    supabase.rpc('admin_list_claims', { p_status: 'decided' }),
  ]);
  const toRow = (c: NonNullable<typeof open.data>[number]): ClaimRow => ({
    id: c.id,
    ref: c.ref,
    bookId: c.book_id,
    title: c.book_title,
    author: c.author_name,
    claimant: c.claimant_name,
    type: c.type,
    status: c.status,
    createdAt: c.created_at,
    dueAt: c.due_at,
    late: c.late,
  });
  // Newest first, as on s-claims; late ones show their Due date in bold.
  const openRows = (open.data ?? []).map(toRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const waiting = openRows.filter((c) => c.status === 'waiting_on_author');
  const decidedRows = (decided.data ?? []).map(toRow).reverse();
  const rows = tab === 'decided' ? decidedRows : tab === 'waiting' ? waiting : openRows;
  return (
    <ClaimsView
      tab={tab}
      rows={rows}
      counts={{ open: openRows.length, waiting: waiting.length, decided: decidedRows.length }}
      failed={!!(tab === 'decided' ? decided.error : open.error)}
    />
  );
}
