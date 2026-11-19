'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export async function assignTicketToMe(ticketId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('update_ticket', { p_ticket: ticketId });
  if (error) return { error: error.message.includes('not allowed') ? 'Your role cannot answer support.' : "That didn't save. Try again." };
  revalidatePath('/support');
  return { ok: true };
}

type Result = { ok?: boolean; error?: string };
const failure = (message: string) =>
  message.includes('not allowed') ? 'Your role cannot answer support.' : "That didn't save. Try again.";

/** s-ticket Send / Send and solve: the reader gets an in-app message and an email. */
export async function replyToTicket(ticketId: string, body: string, solve: boolean, macroId: string | null): Promise<Result> {
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
