'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { payoutError } from '../royalties/shared';

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Verify, Ask for document or Reject (rule 22, 24). Verify releases held payouts and waiting retries. */
export async function reviewBankAccount(
  account: string,
  decision: 'verify' | 'ask_document' | 'reject',
  reason: string,
  name: string,
): Promise<Result> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('review_bank_account', {
    p_account: account,
    p_decision: decision,
    p_reason: decision === 'verify' ? undefined : reason,
  });
  if (error) {
    return {
      ok: false,
      error: payoutError(
        error,
        {
          '42501': 'Only Finance and Super admins can review bank accounts.',
          reason_required: 'Choose a reason first.',
          already_decided: 'Someone already decided this account.',
        },
        "Couldn't save the decision. Nothing changed. Try again.",
      ),
    };
  }
  revalidatePath('/bank-accounts');
  const first = name.split(' ')[0] ?? 'The author';
  const retries = Number((data as { retries_queued?: number } | null)?.retries_queued ?? 0);
  return {
    ok: true,
    message:
      decision === 'verify'
        ? `${first}'s account verified. Held earnings go out in the next run${retries ? `, and ${retries} waiting retr${retries === 1 ? 'y was' : 'ies were'} queued` : ''}.`
        : decision === 'reject'
          ? `Account rejected: ${reason.toLowerCase()}. ${first} was emailed to submit another.`
          : `${first} was asked for a document. The account stays on hold.`,
  };
}
