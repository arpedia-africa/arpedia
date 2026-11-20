'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export async function assignTicketToMe(ticketId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('update_ticket', { p_ticket: ticketId });
  if (error)
    return {
      error: error.message.includes('not allowed')
        ? 'Your role cannot answer support.'
        : "That didn't save. Try again.",
    };
  revalidatePath('/support');
  return { ok: true };
}

type Result = { ok?: boolean; error?: string };
const failure = (message: string) =>
  message.includes('not allowed') ? 'Your role cannot answer support.' : "That didn't save. Try again.";

/** s-ticket Send / Send and solve: the reader gets an in-app message and an email. */
export async function replyToTicket(
  ticketId: string,
  body: string,
  solve: boolean,
  macroId: string | null,
): Promise<Result> {
  if (!body.trim()) return { error: 'Write a reply first.' };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('reply_ticket', {
    p_ticket: ticketId,
    p_body: body,
    p_solve: solve,
    ...(macroId ? { p_macro: macroId } : {}),
  });
  if (error) return { error: failure(error.message) };
  revalidatePath('/support');
  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}

/** Internal note: staff only, readers never see it. */
export async function addTicketNote(ticketId: string, body: string): Promise<Result> {
  if (!body.trim()) return { error: 'Write the note first.' };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('add_ticket_note', { p_ticket: ticketId, p_body: body });
  if (error) return { error: failure(error.message) };
  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}

type Status = 'open' | 'waiting_on_reader' | 'solved';
type Category = 'billing' | 'book_access' | 'account' | 'author_help' | 'bug' | 'other';

/** Status, assignee (me or nobody) and category from the ticket sidebar. */
export async function updateTicket(
  ticketId: string,
  change: { status?: Status; category?: Category; assignee?: 'me' | 'none' },
): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('update_ticket', {
    p_ticket: ticketId,
    ...(change.status ? { p_status: change.status } : {}),
    ...(change.category ? { p_category: change.category } : {}),
    ...(change.assignee === 'none' ? { p_unassign: true } : {}),
  });
  if (error) return { error: failure(error.message) };
  revalidatePath('/support');
  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}

export type ReturnReason = 'skipped_ahead' | 'did_not_open' | 'wrong_book';

export interface ReturnPreview {
  ledger_id: number;
  credits: number;
  charged_at: string;
  reader_name: string;
  book: { id: string; title: string; author_name: string } | null;
  chapter: { id: string; ord: number; title: string | null; pages: number } | null;
  undo_window_open: boolean;
  returned: boolean;
  needs_approval: boolean;
}

/** unlock-return: what the charge was and whether it can be returned (rule 39). */
export async function returnPreview(ledgerId: number): Promise<{ data?: ReturnPreview; error?: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_return_preview', { p_ledger: ledgerId });
  if (error) {
    if (error.message.includes('not_chapter_charge'))
      return { error: 'Only a chapter charge can be returned.' };
    if (error.message.includes('not allowed')) return { error: 'Your role can’t return credits.' };
    return { error: "This charge didn't load. Try again." };
  }
  return { data: data as unknown as ReturnPreview };
}

/** staff_return_chapter_charge: done at once, or waits for Finance over 50 credits / a 4th return in 30 days. */
export async function returnChapterCharge(
  ledgerId: number,
  reason: ReturnReason,
): Promise<{ state?: 'done' | 'pending_approval'; error?: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_return_chapter_charge', {
    p_ledger: ledgerId,
    p_reason: reason,
  });
  if (error) {
    const m = error.message;
    if (m.includes('undo_window_open'))
      return { error: 'The reader can still undo this themselves. Try again in a few minutes.' };
    if (m.includes('already_undone')) return { error: 'The reader already undid this charge.' };
    if (m.includes('already_returned')) return { error: 'This charge was already returned.' };
    if (m.includes('not allowed')) return { error: 'Your role can’t return credits.' };
    return { error: "That didn't save. Nothing changed. Try again." };
  }
  revalidatePath('/support');
  return { state: (data as { state: 'done' | 'pending_approval' }).state };
}
