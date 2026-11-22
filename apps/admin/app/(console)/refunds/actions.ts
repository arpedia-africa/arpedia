'use server';

import { revalidatePath } from 'next/cache';
import { naira } from '@arpedia/core';
import { rpcError } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Decide a web refund (rule 32). Refund queues the Flutterwave call and the Worker finishes it (then
 * unspent credits are clawed back); Decline emails the reader. Finance and Super admin, with two-step.
 */
export async function decideRefund(
  requestId: string,
  refund: boolean,
  type: 'full' | 'partial',
  amountKobo: number | null,
  note: string,
  name: string,
): Promise<Result> {
  if (refund && type === 'partial' && (!amountKobo || amountKobo < 1)) {
    return { ok: false, error: 'Enter the amount to refund.' };
  }
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('decide_refund', {
    p_request: requestId,
    p_refund: refund,
    p_type: type,
    p_amount_kobo: type === 'partial' ? (amountKobo as number) : undefined,
    p_note: note.trim() || undefined,
  });
  if (error) {
    return {
      ok: false,
      error: rpcError(
        error.code,
        error.message,
        {
          '42501': 'Only Finance and Super admins can decide a refund.',
          not_waiting: 'This request was already decided.',
          bad_amount: 'A partial refund must be more than ₦0 and less than the full payment.',
        },
        "Couldn't save the decision. Nothing changed. Try again.",
      ),
    };
  }
  revalidatePath('/refunds');
  const first = name.split(' ')[0] ?? 'the reader';
  return {
    ok: true,
    message: refund
      ? `${amountKobo ? naira(amountKobo) : 'The refund'} is on its way to ${first} through Flutterwave. Unspent credits come off once it lands, and ${first} is emailed.`
      : `Refund declined. ${first} was emailed.`,
  };
}
