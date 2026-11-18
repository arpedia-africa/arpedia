'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

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
