'use server';

import { revalidatePath } from 'next/cache';
import type { Database, Json } from '@arpedia/core';
import { stepUp, stepUpError } from '@/lib/stepup';
import { serverSupabase } from '@/lib/supabase/server';

export type ExportKind = Database['public']['Enums']['export_kind'];

export interface ActionResult {
  ok?: boolean;
  error?: string;
  needCode?: boolean;
}

const failed = (message?: string): ActionResult => {
  if (message && /^(Finance can|Only a Super admin|Say why)/.test(message)) return { error: `${message}.` };
  if (message && /insufficient|Not allowed/i.test(message)) return { error: "Your role can't export this." };
  return { error: "The export didn't start. Try again." };
};

/**
 * Start an export. With personal columns (emails, phone numbers) it needs a reason and a fresh code,
 * used once within 5 minutes (flow 16 rule 6); `otp` is ignored otherwise.
 */
export async function createExport(
  kind: ExportKind,
  params: { from: string; to: string },
  columns: string[],
  reason: string,
  personal = false,
  otp = '',
): Promise<ActionResult> {
  let stepup: string | undefined;
  if (personal) {
    const step = await stepUp(otp, 'export_personal');
    if ('error' in step) return { error: step.error, needCode: true };
    stepup = step.id;
  }
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_create_export', {
    p_kind: kind,
    p_params: params as unknown as Json,
    p_columns: columns,
    p_reason: reason.trim() || undefined,
    p_stepup: stepup,
  });
  if (error) {
    const expired = stepUpError(error.message);
    return expired ? { error: expired, needCode: true } : failed(error.message);
  }
  revalidatePath('/exports');
  return { ok: true };
}

export async function setSchedule(kind: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_set_export_schedule', { p_kind: kind, p_enabled: enabled });
  if (error) return { error: /insufficient|Not allowed/i.test(error.message) ? "Your role can't change this report." : "That didn't save." };
  revalidatePath('/exports');
  return { ok: true };
}
