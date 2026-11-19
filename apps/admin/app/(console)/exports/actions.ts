'use server';

import { revalidatePath } from 'next/cache';
import type { Database, Json } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';

export type ExportKind = Database['public']['Enums']['export_kind'];

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

const failed = (message?: string): ActionResult => {
  if (message && /^(Finance can|Only a Super admin|Say why)/.test(message)) return { error: `${message}.` };
  if (message && /insufficient|Not allowed/i.test(message)) return { error: "Your role can't export this." };
  return { error: "The export didn't start. Try again." };
};

export async function createExport(
  kind: ExportKind,
  params: { from: string; to: string },
  columns: string[],
  reason: string,
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_create_export', {
    p_kind: kind,
    p_params: params as unknown as Json,
    p_columns: columns,
    p_reason: reason.trim() || undefined,
  });
  if (error) return failed(error.message);
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
