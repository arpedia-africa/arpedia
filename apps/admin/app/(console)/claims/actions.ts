'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

function failure(m: string): ActionResult {
  if (m.startsWith('already_decided:')) return { error: `${m.slice('already_decided:'.length)} already decided this.` };
  if (m.includes('not_found')) return { error: 'This claim is already decided or no longer exists.' };
  if (m.includes('reason_required')) return { error: 'Add a reason. The author and the claimant both see it.' };
  if (m.includes('not allowed')) return { error: 'Your role can’t decide claims.' };
  return { error: "That didn't save. Nothing changed. Try again." };
}

/** claim_ask_author: 7 days to answer; asking again sends a reminder and extends (rule 30). */
export async function askAuthor(claimId: string, days = 7): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('claim_ask_author', { p_claim: claimId, p_days: days });
  if (error) return failure(error.message);
  revalidatePath('/claims');
  return { ok: true };
}

/** decide_claim: Reject releases the hold; Uphold takes the book down (rule 30, 31). */
export async function decideClaim(claimId: string, decision: 'reject' | 'uphold', note: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('decide_claim', { p_claim: claimId, p_decision: decision, p_note: note });
  if (error) return failure(error.message);
  revalidatePath('/claims');
  return { ok: true };
}
