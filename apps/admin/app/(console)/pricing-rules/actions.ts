'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { verifyCode } from '../pricing/verify';
import type { Rules } from '../pricing/format';

export interface RulesPreview {
  books_changed: number | null;
  avg_before: number | null;
  avg_after: number | null;
  biggest: { book_id: string; title: string; before: number | null; after: number } | null;
  effective_at: string;
  plan_check_ok: boolean;
}

type Edits = Omit<Rules, 'store_fee_pct'>;

function errorText(error: { message: string; code?: string }): string {
  const m = error.message;
  if (m.includes('bad_rules')) return 'One of the rules is out of range. Check the hints under each field and try again.';
  if (m.includes('plan_check_failed'))
    return 'A plan would stop earning more than the author rate after the store fee. Raise the plan price or lower the author rate.';
  if (error.code === '42501') return 'Only a Super admin can save pricing rules, with a fresh 2-step code.';
  return "Couldn't do that. Nothing changed. Try again.";
}

/** What saving these rules would change (rule 25). Nothing is written. */
export async function previewRules(rules: Edits): Promise<{ ok: true; preview: RulesPreview } | { ok: false; error: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('preview_pricing_rules', { p_rules: rules });
  if (error) return { ok: false, error: errorText(error) };
  return { ok: true, preview: data as unknown as RulesPreview };
}

/** Save the rules from 00:00 WAT tomorrow (rule 24). Needs a Super admin and a code from the last 10 minutes. */
export async function saveRules(
  rules: Edits,
  otp: string,
): Promise<{ ok: true } | { ok: false; error: string; needCode?: boolean }> {
  const bad = await verifyCode(otp);
  if (bad) return { ok: false, error: bad, needCode: true };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('save_pricing_rules', { p_rules: rules });
  if (error) return { ok: false, error: errorText(error), needCode: error.code === '42501' };
  revalidatePath('/pricing-rules');
  revalidatePath('/pricing');
  return { ok: true };
}
