'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';
import { stepUp, stepUpError } from '@/lib/stepup';
import { serverSupabase } from '@/lib/supabase/server';
import type { Integration } from './client';

type Result = { ok: true } | { ok: false; error: string };

/** "Check all now" (rule 39): the api Worker runs every check at once; returns the fresh rows. */
export async function checkAllNow(): Promise<{ ok: true; services: Integration[] } | { ok: false; error: string }> {
  const r = await api<{ ok: true }>('/v1/integrations/check', {});
  if (!r.ok)
    return {
      ok: false,
      error: r.status === 403 ? 'You need settings access to run the checks.' : "Couldn't run the checks. Try again.",
    };
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('list_integrations');
  revalidatePath('/integrations');
  if (error) return { ok: false, error: 'The checks ran, but the results didn’t load. Refresh the page.' };
  return { ok: true, services: (data ?? []) as unknown as Integration[] };
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
