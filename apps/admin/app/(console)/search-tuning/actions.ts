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

/** Books staff can link a request to: live, scheduled or still in the pipeline (draft). */
export async function findLinkableBooks(
  q: string,
): Promise<{ id: string; title: string; author: string; status: string }[]> {
  const term = q.trim().replace(/[%_,()]/g, ' ');
  if (term.length < 2) return [];
  const supabase = await serverSupabase();
  const { data } = await supabase
    .from('books')
    .select('id, title, status, author:profiles!books_author_id_fkey(full_name)')
    .in('status', ['draft', 'live', 'scheduled'])
    .ilike('title', `%${term}%`)
    .order('title')
    .limit(8);
  return (data ?? []).map(b => ({ id: b.id, title: b.title, author: b.author?.full_name ?? '', status: b.status }));
}

/** Link every open or wishlisted request for a query to a book. Requesters hear when it is live. */
export async function linkRequest(query: string, bookId: string): Promise<Result & { linked?: number }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('link_book_request_query', { p_query: query, p_book: bookId });
  if (error)
    return {
      ok: false,
      error:
        error.code === '42501'
          ? 'Only Operations admins, Publishers and Super admins link requests.'
          : "Couldn't link the request. Try again.",
    };
  revalidatePath('/search-tuning');
  return { ok: true, linked: data ?? 0 };
}

/** Add a zero-result query to the acquisition wishlist (or put it back to open). */
export async function setRequestStatus(query: string, status: 'open' | 'wishlist'): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_book_request_status', { p_query: query, p_status: status });
  if (error) return { ok: false, error: "Couldn't update the wishlist. Try again." };
  revalidatePath('/search-tuning');
  return { ok: true };
}
