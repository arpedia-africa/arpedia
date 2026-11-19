'use server';

import { revalidatePath } from 'next/cache';
import { ledgerDay } from '@arpedia/core';
import { rpcError } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Extend a subscription by 7, 14 or 30 days (rule 33): a promotional entitlement in RevenueCat, logged
 * in the audit log, with a push to the reader. Finance and Super admin, with two-step.
 */
export async function extendSubscription(subscriptionId: string, days: number, name: string): Promise<Result> {
  if (![7, 14, 30].includes(days)) return { ok: false, error: 'Pick 7, 14 or 30 days.' };
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_extend_subscription', {
    p_sub: subscriptionId,
    p_days: days,
    p_reason: `Promotional extension of ${days} days`,
  });
  if (error) {
    return {
      ok: false,
      error: rpcError(
        error.code,
        error.message,
        {
          '42501': 'Only Finance and Super admins can extend a subscription.',
          bad_days: 'Pick 7, 14 or 30 days.',
          unknown_subscription: 'We couldn’t find this subscription.',
        },
        "Couldn't extend the subscription. Nothing changed. Try again.",
      ),
    };
  }
  const r = data as { period_end: string };
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath('/subscriptions');
  const first = name.split(' ')[0] ?? 'The reader';
  return { ok: true, message: `${first} gets ${days} free days, now ending ${ledgerDay(r.period_end)}. They were sent a push.` };
}
