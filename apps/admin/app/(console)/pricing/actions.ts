'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { verifyCode } from './verify';

export type SavePlanResult = { ok: true } | { ok: false; error: string; needCode?: boolean };

/**
 * Save one plan's name, badge, web price, credits and effective date (rule 23). save_plan runs the plan
 * check, writes a new price version and the audit log; it needs Super admin or Finance and a code from
 * the last 10 minutes, so the code is verified first.
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
  const { error } = await supabase.rpc('save_plan', {
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
    if (error.code === '42501')
      return { ok: false, error: 'Only Super admins and Finance can change prices, with a fresh 2-step code.', needCode: true };
    return { ok: false, error: "Couldn't save the plan. Nothing changed. Try again." };
  }
  revalidatePath('/pricing');
  return { ok: true };
}
