'use server';

import { revalidatePath } from 'next/cache';
import { naira } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';
import { payoutError } from '../royalties/shared';

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Retry a failed or reversed transfer (rule 18). No blind retries: either staff confirm the author
 * fixed the same account, or the money waits for a newer, verified account.
 */
export async function retryPayout(
  payout: string,
  mode: 'same_account_confirmed' | 'new_account_when_verified',
  amountKobo: number,
  name: string,
): Promise<Result> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('retry_payout', {
    p_payout: payout,
    p_mode: mode,
    p_confirmed: mode === 'same_account_confirmed',
  });
  if (error) {
    return {
      ok: false,
      error: payoutError(
        error,
        {
          '42501': 'Only Finance and Super admins can retry a payout.',
          not_failed: 'This transfer didn’t fail, so there is nothing to retry.',
          already_retried: 'This transfer was already retried.',
          already_paid: 'This month was already paid to the author.',
          no_verified_account: 'The author has no verified account to send to.',
        },
        "Couldn't queue the retry. No money moved. Try again.",
      ),
    };
  }
  const waiting = (data as { waiting_for_account?: boolean } | null)?.waiting_for_account;
  const first = name.split(' ')[0] ?? 'The author';
  revalidatePath('/payouts');
  return {
    ok: true,
    message: waiting
      ? `Retry queued for ${naira(amountKobo)}. It goes once ${first}'s new account is verified.`
      : `Retry queued for ${naira(amountKobo)}. ${first} is told by push and email when it lands.`,
  };
}
