'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: boolean; error?: string };

export interface TuningChanges {
  settings?: { typo_distance?: number; include_authors?: boolean; show_unreleased?: boolean };
  synonyms_add?: string[][];
  synonyms_remove?: string[];
  promotions_add?: { query: string; book_id: string; position: number; expires_at: string | null }[];
  promotions_remove?: string[];
}

/** Save changes: one call, one audit entry per change group (settings, synonyms, promotions). */
export async function saveTuning(changes: TuningChanges): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('save_search_tuning', { p: changes as never });
  if (error)
    return {
      ok: false,
      error:
        error.code === '42501'
          ? 'Only Operations admins and Super admins tune search.'
          : "Couldn't save search changes. Try again.",
    };
  revalidatePath('/search-tuning');
  return { ok: true };
}

/** Add a zero-result query to the acquisition wishlist (or put it back to open). */
export async function setRequestStatus(query: string, status: 'open' | 'wishlist'): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_book_request_status', { p_query: query, p_status: status });
  if (error) return { ok: false, error: "Couldn't update the wishlist. Try again." };
  revalidatePath('/search-tuning');
  return { ok: true };
}
