'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { stepUp, stepUpError } from '@/lib/stepup';
import { verifyCode } from './verify';

export type SavePlanResult = { ok: true; pending: boolean } | { ok: false; error: string; needCode?: boolean };

/**
 * Save one plan's name, badge, web price, credits and effective date (rule 23). save_plan runs the plan
 * check and the audit log; it needs Super admin or Finance and a code from the last 10 minutes, so the
 * code is verified first. A change to the price or credits waits for a second Super admin (rule 17):
 * `pending` is true and nothing changes until they confirm.
 */
export async function savePlan(input: {
  code: string;
  name: string;
  badge: string;
  priceNaira: number;
  credits: number;
  bonus: number;
  /** ISO time the new price starts, or null for now. */
  effectiveFrom: string | null;
  otp: string;
}): Promise<SavePlanResult> {
  const { code, name, badge, priceNaira, credits, bonus, effectiveFrom, otp } = input;
  if (!name.trim() || name.trim().length > 40) return { ok: false, error: 'Give the plan a name of up to 40 letters.' };
  if (!Number.isInteger(priceNaira) || priceNaira < 1) return { ok: false, error: 'Enter the web price in whole naira.' };
  if (!Number.isInteger(credits) || credits < 1) return { ok: false, error: 'Enter a whole number of credits, 1 or more.' };
  const bad = await verifyCode(otp);
  if (bad) return { ok: false, error: bad, needCode: true };

  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('save_plan', {
    p_code: code,
    p_name: name.trim(),
    p_badge: badge.trim(),
    p_price_web_kobo: priceNaira * 100,
    p_credits: credits,
    p_bonus: bonus,
    p_effective_from: effectiveFrom ?? new Date().toISOString(),
  });
  if (error) {
    const m = error.message;
    if (m.includes('plan_check_failed'))
      return { ok: false, error: 'That price is too low. Every credit must still earn more than the author rate after the store fee.' };
    if (m.includes('bad_plan')) return { ok: false, error: 'Check the name, price and credits and try again.' };
    if (m.includes('unknown_plan')) return { ok: false, error: 'This plan no longer exists.' };
    if (m.includes('change_pending'))
      return { ok: false, error: 'A price change for this plan is already waiting for a Super admin. Ask them to confirm or reject it first.' };
    if (error.code === '42501')
      return { ok: false, error: 'Only Super admins and Finance can change prices, with a fresh 2-step code.', needCode: true };
    return { ok: false, error: "Couldn't save the plan. Nothing changed. Try again." };
  }
  revalidatePath('/pricing');
  return { ok: true, pending: !!(data as { pending_request?: string } | null)?.pending_request };
}

export type DecideResult = { ok: true } | { ok: false; error: string; needCode?: boolean };

/**
 * Confirm or reject a plan price change someone else proposed (rule 17). Confirming needs a fresh code,
 * used once within 5 minutes (flow 16 rule 6): decide_approval writes the price version, running the
 * plan check again.
 */
export async function decidePriceChange(input: { id: string; approve: boolean; otp: string }): Promise<DecideResult> {
  const { id, approve, otp } = input;
  let stepup: string | undefined;
  if (approve) {
    const step = await stepUp(otp, 'confirm_price_change');
    if ('error' in step) return { ok: false, error: step.error, needCode: true };
    stepup = step.id;
  }
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('decide_approval', { p_id: id, p_approve: approve, p_stepup: stepup });
  if (error) {
    const m = error.message;
    const expired = stepUpError(m);
    if (expired) return { ok: false, error: expired, needCode: true };
    if (m.includes('own_request')) return { ok: false, error: 'You proposed this change, so another Super admin must confirm it.' };
    if (m.includes('already_decided')) return { ok: false, error: 'Someone has already decided this change.' };
    if (m.includes('request_expired')) return { ok: false, error: 'This change waited over 7 days and has expired. Propose it again.' };
    if (m.includes('plan_check_failed'))
      return { ok: false, error: 'The pricing rules have changed and this price now fails the plan check. Reject it instead.' };
    if (error.code === '42501')
      return { ok: false, error: 'Only Super admins can confirm a price change, with a fresh 2-step code.', needCode: true };
    return { ok: false, error: "Couldn't save your decision. Nothing changed. Try again." };
  }
  revalidatePath('/pricing');
  return { ok: true };
}
