'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

/** Approve update: publish the revision now; readers move to it (rules 38, 47). */
export async function approveUpdate(revisionId: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('publish_revision', { p_rev: revisionId, p_notify_followers: false });
  if (error) {
    const m = error.message;
    if (m.includes('own book')) return { ok: false, error: "You can't publish a book you wrote or uploaded." };
    if (m.includes('blocking')) return { ok: false, error: 'A flag blocks publishing. Send it back or fix it first.' };
    if (m.includes('not ready')) return { ok: false, error: 'This update is no longer waiting for review.' };
    if (m.includes('sealed') || m.includes('preview cut') || m.includes('prices'))
      return { ok: false, error: "The book file isn't ready to publish yet. Try again in a minute." };
    if (error.code === '42501') return { ok: false, error: 'Only publishers can approve updates.' };
    return { ok: false, error: "Couldn't publish the update. Try again." };
  }
  revalidatePath('/books');
  return { ok: true };
}

/** Spot audit of a fast-lane publish: ok, or a problem with a note (rule 44). */
export async function auditFastLane(revisionId: string, problem: boolean, note: string | null): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('audit_fast_lane', {
    p_rev: revisionId,
    p_result: problem ? 'problem' : 'ok',
    p_note: note ?? '',
  });
  if (error) {
    if (error.code === 'P0002' || error.message.includes('audit queue'))
      return { ok: false, error: 'Someone already audited this update.' };
    if (error.code === '42501') return { ok: false, error: 'Only publishers can audit updates.' };
    return { ok: false, error: "Couldn't save the audit. Try again." };
  }
  revalidatePath('/books');
  return { ok: true };
}

/** Revert: republish an earlier revision; readers move back to it (rule 44). */
export async function revert(revisionId: string, reason: string): Promise<Result> {
  if (!reason.trim()) return { ok: false, error: 'Say why you are reverting.' };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('revert_to_revision', { p_rev: revisionId, p_reason: reason.trim() });
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'Only publishers can revert a book.' };
    if (error.message.includes('earlier published')) return { ok: false, error: 'That revision was never live.' };
    return { ok: false, error: "Couldn't revert. Try again." };
  }
  revalidatePath('/books');
  return { ok: true };
}
