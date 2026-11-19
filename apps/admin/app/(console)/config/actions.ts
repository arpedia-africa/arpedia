'use server';

import { revalidatePath } from 'next/cache';
import { stepUp, stepUpError, type StepUpScope } from '@/lib/stepup';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string; needCode?: boolean };

function errorText(error: { message: string; code?: string; details?: string }): string {
  const m = error.message;
  const expired = stepUpError(m);
  if (expired) return expired;
  if (m.includes('bad_version')) return 'Use a version like 25.4 (major.minor).';
  if (m.includes('missing_placeholder')) {
    const missing = /"missing"\s*:\s*\[([^\]]*)\]/.exec(error.details ?? '')?.[1]?.replace(/"/g, '');
    return `Keep ${missing || 'the placeholders'} in the text. The app fills ${missing ? 'it' : 'them'} in.`;
  }
  if (m.includes('bad_text')) return 'Write between 1 and 200 characters.';
  if (m.includes('bad_value')) return 'Write a message to readers of 10 to 280 characters.';
  if (m.includes('no_previous_bundle')) return 'There is no previous bundle to roll back to.';
  if (error.code === '42501') return 'Only a Super admin can change this.';
  return "Couldn't save that. Nothing changed. Try again.";
}

async function withCode(otp: string | null, scope: StepUpScope) {
  if (otp == null) return { id: null as string | null };
  const step = await stepUp(otp, scope);
  return 'error' in step ? { error: step.error } : { id: step.id };
}

/** Versions, force update and maintenance (rules 24–26). Turning force update or maintenance on needs a code. */
export async function saveConfig(key: string, value: unknown, otp: string | null = null): Promise<Result> {
  const scope: StepUpScope = key === 'maintenance' ? 'maintenance' : 'force_update';
  const step = await withCode(otp, scope);
  if ('error' in step) return { ok: false, error: step.error ?? '', needCode: true };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_config', {
    p_key: key,
    p_value: value as never,
    p_stepup: step.id ?? undefined,
  });
  if (error) return { ok: false, error: errorText(error), needCode: !!stepUpError(error.message) };
  revalidatePath('/config');
  return { ok: true };
}

/** Rule 27: on/off for everyone (Undo calls it again). */
export async function saveFlag(key: string, enabled: boolean): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_flag', { p_key: key, p_enabled: enabled });
  if (error) return { ok: false, error: errorText(error) };
  revalidatePath('/config');
  return { ok: true };
}

/** Rule 29: remote copy keeps its placeholders. */
export async function saveCopy(key: string, text: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_copy', { p_key: key, p_text: text });
  if (error) return { ok: false, error: errorText(error) };
  revalidatePath('/config');
  return { ok: true };
}

/** Rule 28: roll back to the previous over-the-air bundle, with a fresh code. */
export async function rollbackOta(otp: string): Promise<Result> {
  const step = await stepUp(otp, 'ota_rollback');
  if ('error' in step) return { ok: false, error: step.error, needCode: true };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('rollback_ota', { p_stepup: step.id });
  if (error) return { ok: false, error: errorText(error), needCode: !!stepUpError(error.message) };
  revalidatePath('/config');
  return { ok: true };
}
