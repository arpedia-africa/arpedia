'use server';

import { rpcError } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Resend receipt (rules 31 and 33): emails the reader's web payment receipt again. Finance and Super
 * admin, logged in the audit log. Store payments have no Arpedia receipt (Google and Apple send theirs).
 */
export async function resendReceipt(transactionId: string, name: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_resend_receipt', { p_transaction: transactionId });
  if (error) {
    return {
      ok: false,
      error: rpcError(
        error.code,
        error.message,
        {
          '42501': 'Only Finance and Super admins can resend a receipt.',
          not_web: 'Google Play and App Store send their own receipts.',
          not_paid: 'This payment didn’t go through, so there is no receipt.',
          unknown_transaction: 'We couldn’t find this payment.',
        },
        "Couldn't resend the receipt. Try again.",
      ),
    };
  }
  const first = name.split(' ')[0] || 'the reader';
  return { ok: true, message: `Receipt sent to ${first}’s email` };
}
