'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

/** Send back to author (rules 34, 36): sets `sent_back`, stores the list, tells the author by push and email. */
export async function sendBack(
  revisionId: string,
  issues: { text: string }[],
  note: string,
  source: 'fixer' | 'quick_review',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('send_back_revision', {
    p_rev: revisionId,
    p_issues: issues,
    // empty is fine: the RPC stores null for a blank note
    p_note: note,
    p_source: source,
  });
  if (error) {
    if (error.message.includes('at least one')) return { ok: false, error: 'Add at least one issue or a note.' };
    if (error.message.includes('not waiting')) return { ok: false, error: 'This book is no longer waiting for staff.' };
    if (error.code === '42501') return { ok: false, error: 'Only publishers can send books back.' };
    return { ok: false, error: "Couldn't send it back. Try again." };
  }
  revalidatePath('/books');
  return { ok: true };
}

/** Undo Mark fixed and send to review: back to Needs fixes while nobody has opened Quick review (rule 32). */
export async function undoRelease(revisionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('undo_release_to_review', { p_rev: revisionId });
  if (error)
    return {
      ok: false,
      error: error.message.includes('too late')
        ? 'Someone already opened it in Quick review, so it stays there.'
        : "Couldn't undo. Try again.",
    };
  revalidatePath('/books');
  return { ok: true };
}

/** Unpublish (rule 52): reason, readers' access, notify readers, and the title typed to confirm. */
export async function unpublish(
  bookId: string,
  reason: 'author_request' | 'policy_violation' | 'quality',
  removeAccess: boolean,
  notifyReaders: boolean,
  confirmTitle: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('unpublish_book', {
    p_book: bookId,
    p_reason: reason,
    p_remove_access: removeAccess,
    p_notify_readers: notifyReaders,
    p_confirm_title: confirmTitle,
  });
  if (error) {
    const m = error.message;
    if (m.includes('Super admin')) return { ok: false, error: 'Only a Super admin can remove access.' };
    if (m.includes('policy violations')) return { ok: false, error: 'Remove access is for policy violations only.' };
    if (m.includes('title')) return { ok: false, error: 'Type the book title exactly to confirm.' };
    if (m.includes('not live')) return { ok: false, error: 'This book is not live.' };
    if (error.code === '42501') return { ok: false, error: 'Only publishers can unpublish books.' };
    return { ok: false, error: "Couldn't unpublish. Try again." };
  }
  revalidatePath('/books');
  return { ok: true };
}

/** Undo Unpublish: the book goes back live on the same revision. */
export async function republish(bookId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('republish_book', { p_book: bookId });
  if (error) return { ok: false, error: "Couldn't republish. Try again." };
  revalidatePath('/books');
  return { ok: true };
}
