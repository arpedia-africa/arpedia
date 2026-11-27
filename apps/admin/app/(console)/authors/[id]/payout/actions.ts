'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { payoutError } from '../../../royalties/shared';

type Result = { ok: true; message: string } | { ok: false; error: string };

export type PauseReason = 'account_dispute' | 'suspected_fraud' | 'author_request' | 'other';

/** Pause or lift an author's payouts (rule 12): reason required, logged, the author is not told. */
export async function setPayoutHold(
  author: string,
  pause: boolean,
  reason: PauseReason | null,
  name: string,
  note = '',
): Promise<Result> {
  if (pause && reason === 'other' && note.trim().length < 3) return { ok: false, error: 'Say why in a few words.' };
  const supabase = await serverSupabase();
  const first = name.split(' ')[0] ?? 'this author';
  const { error } = pause
    ? await supabase.rpc('pause_author_payouts', {
        p_author: author,
        p_reason: reason ?? 'other',
        p_note: note.trim() || undefined,
      })
    : await supabase.rpc('lift_pause', { p_author: author });
  if (error) {
    return {
      ok: false,
      error: payoutError(
        error,
        {
          '42501': 'Only Finance and Super admins can pause payouts.',
          reason_required: reason === 'other' ? 'Say why in a few words.' : 'Choose a reason to pause.',
          not_paused: 'Payouts were already on.',
        },
        "Couldn't save. Nothing changed. Try again.",
      ),
    };
  }
  revalidatePath(`/authors/${author}/payout`);
  revalidatePath(`/authors/${author}`);
  return {
    ok: true,
    message: pause
      ? `Payouts paused for ${first}. Earnings are kept until you turn this off.`
      : `Payouts on again for ${first}. Held earnings go out in the next run.`,
  };
}

/** A year-to-date statement made now (rule 27): the api Worker renders it; returns its id to download. */
export async function requestYtdStatement(author: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Sign in again to make a statement.' };
  const r = await fetch(`${process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787'}/v1/earnings/statements/year-to-date`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ author_id: author }),
  }).catch(() => null);
  if (r?.status === 403) return { ok: false, error: 'Your role can look at payouts but not make statements.' };
  if (!r || !r.ok) return { ok: false, error: "The statement wasn't made. Try again." };
  const { id } = (await r.json()) as { id: string };
  revalidatePath(`/authors/${author}/payout`);
  return { ok: true, id };
}
