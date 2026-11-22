'use server';

import { revalidatePath } from 'next/cache';
import { isPromoCode, normalizePromo } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

export interface NewPromo {
  code: string;
  kind: 'bonus_credits' | 'plan_discount' | 'trial_days';
  amount: number;
  /** Null for no limit. */
  maxUses: number | null;
  usesPerReader: number;
  newReadersOnly: boolean;
  webOnly: boolean;
  /** ISO times; null starts now / never ends. */
  startsAt: string | null;
  endsAt: string | null;
  campaignTag: string;
}

/** Create a promo code (rule 34). Codes are stored lower case; they can't be edited after first use. */
export async function createPromo(p: NewPromo): Promise<Result> {
  if (!isPromoCode(p.code)) return { ok: false, error: 'Use 4 to 16 letters or numbers for the code.' };
  if (!Number.isInteger(p.amount) || p.amount < 1) return { ok: false, error: 'Enter a whole amount, 1 or more.' };
  if (p.kind === 'plan_discount' && p.amount > 90) return { ok: false, error: 'A discount can be 1% to 90%.' };
  if (p.maxUses !== null && (!Number.isInteger(p.maxUses) || p.maxUses < 1))
    return { ok: false, error: 'Total uses must be a whole number, 1 or more. Leave it empty for no limit.' };
  if (!Number.isInteger(p.usesPerReader) || p.usesPerReader < 1) return { ok: false, error: 'Uses per reader must be 1 or more.' };
  if (p.startsAt && p.endsAt && p.endsAt <= p.startsAt) return { ok: false, error: 'The end date must be after the start date.' };

  const supabase = await serverSupabase();
  // The RPC takes null for "no limit", "starts now" and "never ends"; the generated types have no null for these.
  const { error } = await supabase.rpc('create_promo', {
    p_code: normalizePromo(p.code),
    p_kind: p.kind,
    p_amount: p.amount,
    p_max_uses: p.maxUses as number,
    p_uses_per_reader: p.usesPerReader,
    p_new_readers_only: p.newReadersOnly,
    p_web_only: p.webOnly,
    p_starts_at: p.startsAt as string,
    p_ends_at: p.endsAt as string,
    p_campaign_tag: p.campaignTag.trim(),
  });
  if (error) {
    const m = error.message;
    if (m.includes('code_taken')) return { ok: false, error: 'That code is already taken. Try another one.' };
    if (m.includes('bad_code')) return { ok: false, error: 'Use 4 to 16 letters or numbers for the code.' };
    if (error.code === '42501') return { ok: false, error: 'Only Super admins and Finance can create promo codes.' };
    if (error.code === '23514') return { ok: false, error: 'Check the amount and the dates, then try again.' };
    return { ok: false, error: "Couldn't create the code. Nothing was saved. Try again." };
  }
  revalidatePath('/promos');
  return { ok: true };
}

/** Pause or resume a code (rule 34). Ended codes stay ended. */
export async function setPromoStatus(code: string, status: 'active' | 'paused'): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_promo_status', { p_code: code, p_status: status });
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'Only Super admins and Finance can pause promo codes.' };
    if (error.message.includes('bad_status')) return { ok: false, error: 'This code has ended, so it cannot be changed.' };
    return { ok: false, error: "Couldn't update the code. Try again." };
  }
  revalidatePath('/promos');
  return { ok: true };
}
