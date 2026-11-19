'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { stepUp, stepUpError } from '@/lib/stepup';
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

function errorText(error: { message: string; code?: string; details?: string }): string {
  const m = error.message;
  if (m.includes('bad_rules')) return 'One of the rules is out of range. Check the hints under each field and try again.';
  if (m.includes('rules_changed')) {
    const by = /"by"\s*:\s*"([^"]+)"/.exec(error.details ?? '')?.[1];
    return `Rules changed by ${by ?? 'another Super admin'}, review again.`;
  }
  if (m.includes('no_change')) return 'Nothing changed. Edit a rule first.';
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

/**
 * Save the rules from 00:00 WAT tomorrow (flow 16 rules 34–35). Needs a Super admin, a fresh single-use
 * code and the version the page was loaded at, so a second Super admin's save is refused.
 */
export async function saveRules(
  rules: Edits,
  otp: string,
  expectedVersion: number,
): Promise<{ ok: true; id: string } | { ok: false; error: string; needCode?: boolean }> {
  const step = await stepUp(otp, 'pricing_rules');
  if ('error' in step) return { ok: false, error: step.error, needCode: true };
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('save_pricing_rules', {
    p_rules: rules,
    p_expected_version: expectedVersion,
    p_stepup: step.id,
  });
  if (error) {
    const expired = stepUpError(error.message);
    return { ok: false, error: expired ?? errorText(error), needCode: !!expired || error.code === '42501' };
  }
  revalidatePath('/pricing-rules');
  revalidatePath('/pricing');
  return { ok: true, id: (data as { id: string }).id };
}

/** Undo a scheduled save before 00:00 WAT (rule 35). */
export async function undoRules(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('cancel_pricing_rules', { p_id: id });
  if (error)
    return {
      ok: false,
      error: error.message.includes('not_scheduled') ? 'Those rules are already in effect and cannot be undone.' : errorText(error),
    };
  revalidatePath('/pricing-rules');
  revalidatePath('/pricing');
  return { ok: true };
}
