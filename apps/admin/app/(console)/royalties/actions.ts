'use server';

import { revalidatePath } from 'next/cache';
import { naira } from '@arpedia/core';
import { api } from '@/lib/api';
import { serverSupabase } from '@/lib/supabase/server';
import { verifyCode } from '../pricing/verify';
import { payoutError } from './shared';

type Result = { ok: true; message: string } | { ok: false; error: string; needCode?: boolean };

/** Flutterwave's NGN balance from the api Worker, or null when it can't be read (prepare still runs). */
export async function flutterwaveBalance(): Promise<number | null> {
  const r = await api<{ balance_kobo: number }>('/v1/earnings/flutterwave/balance');
  return r.ok ? r.data.balance_kobo : null;
}

/** Recheck against the ledger (rule 13): release is blocked unless the difference is zero. */
export async function recheckCycle(cycle: string, month: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('recheck_cycle', { p_cycle: cycle });
  if (error) return { ok: false, error: payoutError(error, {}, "Couldn't recheck. Nothing changed. Try again.") };
  const diff = Number((data as { diff_kobo?: number } | null)?.diff_kobo ?? 0);
  return diff === 0
    ? { ok: true, message: `${month} rechecked against the credit ledger. The figures did not change.` }
    : { ok: false, error: `${month} differs from the credit ledger by ${naira(Math.abs(diff))}. Release stays blocked until it matches.` };
}

/** Prepare (Finance or Super admin): re-reads holds, runs the checks, records who prepared. */
export async function prepareCycle(cycle: string, month: string): Promise<Result> {
  const balance = await flutterwaveBalance();
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('prepare_cycle', {
    p_cycle: cycle,
    p_flutterwave_balance_kobo: balance ?? undefined,
  });
  if (error) {
    return {
      ok: false,
      error: payoutError(
        error,
        {
          '42501': 'Only Finance and Super admins can prepare a release.',
          ledger_mismatch: `${month} no longer matches the credit ledger. Recheck it before preparing.`,
          hold_not_ended: `The hold for ${month} hasn't ended yet.`,
          bad_status: `${month} was already prepared or released.`,
        },
        "Couldn't prepare. Nothing changed. Try again.",
      ),
    };
  }
  revalidatePath(`/royalties/${cycle}`);
  revalidatePath('/royalties');
  return { ok: true, message: `${month} prepared. A Super admin who didn't prepare it can now approve and release.` };
}

/** Release (Super admin, not the preparer, fresh 2-step code). Safe to call twice. */
export async function releaseCycle(cycle: string, otp: string, label: string): Promise<Result> {
  if (otp.replace(/\D/g, '').length !== 6) return { ok: false, error: 'Enter the 6-digit code.', needCode: true };
  const bad = await verifyCode(otp);
  if (bad) return { ok: false, error: bad, needCode: true };
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('release_cycle', { p_cycle: cycle });
  if (error) {
    return {
      ok: false,
      error: payoutError(
        error,
        {
          '42501': 'Only a Super admin can release payouts.',
          same_person: 'You prepared this release, so another Super admin must approve it.',
          hold_not_ended: "The hold hasn't ended yet.",
          ledger_mismatch: 'The month no longer matches the credit ledger. Recheck it first.',
          bad_status: 'Prepare this month before releasing it.',
        },
        "Couldn't release. No money moved. Try again.",
      ),
    };
  }
  const r = data as { authors: number; total_kobo: number; replayed: boolean };
  revalidatePath('/royalties');
  revalidatePath(`/royalties/${cycle}`);
  revalidatePath('/payouts');
  return {
    ok: true,
    message: r.replayed
      ? `${label} was already released. Nothing was sent twice.`
      : `Release sent to Flutterwave. ${r.authors} author${r.authors === 1 ? '' : 's'} will be paid ${naira(r.total_kobo)}.`,
  };
}

/** Earnings settings (Super admin with a fresh code); apply to the open month only. */
export async function saveSettings(input: {
  holdDays: number;
  minNaira: number;
  payoutDay: number;
  giftLoop: boolean;
  otp: string;
}): Promise<Result> {
  const { holdDays, minNaira, payoutDay, giftLoop, otp } = input;
  if (!Number.isInteger(holdDays) || holdDays < 0 || holdDays > 120) {
    return { ok: false, error: 'Hold period is a whole number of days, 0 to 120.' };
  }
  if (!Number.isInteger(minNaira) || minNaira < 0 || minNaira > 1_000_000) {
    return { ok: false, error: 'Minimum payout is whole naira, up to ₦1,000,000.' };
  }
  if (!Number.isInteger(payoutDay) || payoutDay < 1 || payoutDay > 28) {
    return { ok: false, error: 'Payout day is between the 1st and the 28th.' };
  }
  const bad = await verifyCode(otp);
  if (bad) return { ok: false, error: bad, needCode: true };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('save_earning_settings', {
    p_hold_days: holdDays,
    p_min_payout_kobo: minNaira * 100,
    p_payout_day: payoutDay,
    p_gift_loop_detection: giftLoop,
  });
  if (error) {
    return {
      ok: false,
      error: payoutError(error, { '42501': 'Only a Super admin can change earnings settings.' }, "Couldn't save. Nothing changed. Try again."),
    };
  }
  revalidatePath('/royalties/settings');
  revalidatePath('/royalties');
  return { ok: true, message: 'Settings saved. They apply from this month’s earnings.' };
}
