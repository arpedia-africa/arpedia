'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

/** decide_appeal: a different staff member than the original decider (rule 28). */
export async function decideAppeal(
  appealId: string,
  outcome: 'upheld' | 'reduced' | 'overturned',
  reply: string,
  reduceToDays?: number,
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('decide_appeal', {
    p_appeal: appealId,
    p_outcome: outcome,
    p_reduce_to_days: reduceToDays,
    p_reply: reply,
  });
  if (error) {
    const m = error.message;
    if (m.startsWith('already_decided:')) return { error: `${m.slice('already_decided:'.length)} already decided this.` };
    if (m.includes('original_decider')) return { error: 'You made the original decision. A different staff member must decide.' };
    if (m.includes('nothing_to_reduce')) return { error: 'There is no suspension or mute to reduce on this appeal.' };
    if (m.includes('not allowed')) return { error: 'Your role can’t decide appeals.' };
    return { error: "That didn't save. Nothing changed. Try again." };
  }
  revalidatePath('/appeals');
  return { ok: true };
}
