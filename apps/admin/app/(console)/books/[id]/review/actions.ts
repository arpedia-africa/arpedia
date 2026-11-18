'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

/** Opening Quick review puts the book on this staff member (unless someone else is active on it). */
export async function claimReview(revisionId: string) {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('claim_revision', { p_rev: revisionId, p_screen: 'review' });
  if (error) return { ok: false as const };
  return { ok: true as const, mine: !!(data as { mine?: boolean } | null)?.mine };
}

/** Approve and publish, now or scheduled (rules 37–38). */
export async function publish(
  revisionId: string,
  scheduleAt: string | null,
  notifyFollowers: boolean,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('publish_revision', {
    p_rev: revisionId,
    p_notify_followers: notifyFollowers,
    ...(scheduleAt ? { p_schedule_at: scheduleAt } : {}),
  });
  if (error) {
    const m = error.message;
    if (m.includes('own book')) return { ok: false, error: "You can't publish a book you wrote or uploaded." };
    if (m.includes('blocking')) return { ok: false, error: 'A flag blocks publishing. Send it back or fix it first.' };
    if (m.includes('not ready')) return { ok: false, error: 'This book is no longer waiting for review.' };
    if (m.includes('sealed') || m.includes('preview cut') || m.includes('prices'))
      return { ok: false, error: "The book file isn't ready to publish yet. Try again in a minute." };
    if (error.code === '42501') return { ok: false, error: 'Only publishers can approve books.' };
    return { ok: false, error: "Couldn't publish. Try again." };
  }
  revalidatePath('/books');
  return { ok: true, status: (data as { status?: string } | null)?.status ?? 'live' };
}
