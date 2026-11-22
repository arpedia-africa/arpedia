'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: boolean; error?: string };

const fail = (code: string | undefined, fallback: string): Result => ({
  ok: false,
  error: code === '42501' ? 'Only Publishers, Operations admins and Super admins edit genres.' : fallback,
});

export async function reorderGenres(ids: string[]): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('reorder_genres', { p_ids: ids });
  if (error) return fail(error.code, "Couldn't save the order. Try again.");
  revalidatePath('/genres');
  return { ok: true };
}

export async function setGenreVisible(id: string, visible: boolean): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_genre_visibility', { p_genre: id, p_visible: visible });
  if (error) return fail(error.code, "Couldn't save that. Try again.");
  revalidatePath('/genres');
  return { ok: true };
}

/** Merge tags into one: every book that used them is rewritten (audited). */
export async function mergeTags(from: string[], into: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('merge_tags', { p_from: from, p_into: into });
  if (error) return fail(error.code, "Couldn't merge. Try again.");
  revalidatePath('/genres');
  return { ok: true };
}

/** Ban a word: removed from tags now and stripped from new uploads. */
export async function banTag(word: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('ban_tag', { p_word: word });
  if (error) return fail(error.code, "Couldn't ban that word. Try again.");
  revalidatePath('/genres');
  return { ok: true };
}
