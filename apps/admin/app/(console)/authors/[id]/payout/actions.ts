'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { payoutError } from '../../../royalties/shared';

type Result = { ok: true; message: string } | { ok: false; error: string };

export type PauseReason = 'account_dispute' | 'suspected_fraud' | 'author_request' | 'other';

/** Pause or lift an author's payouts (rule 12): reason required, logged, the author is not told. */
export async function setPayoutHold(author: string, pause: boolean, reason: PauseReason | null, name: string): Promise<Result> {
  const supabase = await serverSupabase();
  const first = name.split(' ')[0] ?? 'this author';
  const { error } = pause
    ? await supabase.rpc('pause_author_payouts', {
        p_author: author,
        p_reason: reason ?? 'other',
        p_note: reason === 'other' ? 'Other (set in the console)' : undefined,
      })
    : await supabase.rpc('lift_pause', { p_author: author });
  if (error) {
    return {
      ok: false,
      error: payoutError(
        error,
        {
          '42501': 'Only Finance and Super admins can pause payouts.',
          reason_required: 'Choose a reason to pause.',
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
