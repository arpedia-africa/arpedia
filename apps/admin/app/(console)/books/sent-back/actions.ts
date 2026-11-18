'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

/** Remind the author of a sent-back book (rule 50): at most once a day; the RPC audits it. */
export async function remindAuthor(revisionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('remind_author', { p_rev: revisionId });
  if (error) {
    if (error.message.includes('already reminded')) return { ok: false, error: 'This author was already reminded today.' };
    if (error.message.includes('not sent back')) return { ok: false, error: 'This book is no longer sent back.' };
    if (error.code === '42501') return { ok: false, error: 'Only publishers can send reminders.' };
    return { ok: false, error: "Couldn't send the reminder. Try again." };
  }
  revalidatePath('/books/sent-back');
  return { ok: true };
}
