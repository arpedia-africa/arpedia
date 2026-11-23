'use server';

import { revalidatePath } from 'next/cache';
import { stepUp, stepUpError } from '@/lib/stepup';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

/** "Check all now": the checks Worker runs within a minute. */
export async function checkAllNow(): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('request_integration_check');
  if (error) return { ok: false, error: "Couldn't start the checks. Try again." };
  revalidatePath('/integrations');
  return { ok: true };
}

/** Record a key rotation (rule 39, Q6 default): Super admin, fresh code, audited. */
export async function rotateKey(service: string, otp: string): Promise<Result> {
  const step = await stepUp(otp, 'rotate_key');
  if ('error' in step) return { ok: false, error: step.error };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('rotate_integration_key', { p_service: service, p_stepup: step.id });
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'Only a Super admin can rotate keys.' };
    return { ok: false, error: stepUpError(error.message) ?? "Couldn't rotate the key. Nothing changed. Try again." };
  }
  revalidatePath('/integrations');
  return { ok: true };
}
