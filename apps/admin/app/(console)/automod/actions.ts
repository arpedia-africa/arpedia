'use server';

import { revalidatePath } from 'next/cache';
import type { Json } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

const failed = (message?: string): ActionResult => {
  const m = message ?? '';
  if (m.includes('not allowed')) return { error: 'Only Moderators and Super admins can change safety rules.' };
  if (m.includes('duplicate key')) return { error: 'That word is already on the list for those places.' };
  if (m.includes('bad_value') || m.includes('check constraint')) return { error: 'That value isn’t allowed.' };
  return { error: "That didn't save. Nothing changed. Try again." };
};

/** Save changed settings, one audited `set_automod_setting` per key. */
export async function saveSettings(changes: Record<string, Json>): Promise<ActionResult> {
  const supabase = await serverSupabase();
  for (const [key, value] of Object.entries(changes)) {
    const { error } = await supabase.rpc('set_automod_setting', { p_key: key, p_value: value });
    if (error) return failed(error.message);
  }
  revalidatePath('/automod');
  return { ok: true };
}

export async function addWord(word: {
  text: string;
  isPhrase: boolean;
  category: string;
  scope: string;
  action: string;
}): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('save_automod_word', {
    p_text: word.text,
    p_is_phrase: word.isPhrase,
    p_category: word.category,
    p_scope: word.scope,
    p_action: word.action,
  });
  if (error) return failed(error.message);
  revalidatePath('/automod');
  return { ok: true, id: data as string };
}

export async function removeWord(id: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('delete_automod_word', { p_id: id });
  if (error) return failed(error.message);
  revalidatePath('/automod');
  return { ok: true };
}
