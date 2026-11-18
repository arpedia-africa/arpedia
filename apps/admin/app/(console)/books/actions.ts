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
