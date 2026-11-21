'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

/** Take an application, so two people do not review the same one (assign_application, rule 8). */
export async function assignToMe(applicationId: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('assign_application', { p_app: applicationId });
  if (error) {
    if (error.message.includes('not_open')) return { ok: false, error: 'This application is already decided.' };
    if (error.code === '42501' || error.message.includes('not a reviewer'))
      return { ok: false, error: 'Only publishers can take applications.' };
    return { ok: false, error: "Couldn't assign it. Try again." };
  }
  revalidatePath('/applications');
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true };
}

export type Decision =
  | { decision: 'approve'; message: string }
  | { decision: 'ask_info'; request: string; step: number }
  | { decision: 'reject'; reason: string; allowReapply: boolean };

/** Approve, ask for info or reject (decide_application): staff writes go only through the RPC. */
export async function decide(applicationId: string, d: Decision): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('decide_application', {
    p_app: applicationId,
    p_decision: d.decision,
    ...(d.decision === 'approve' && d.message.trim() ? { p_reason: d.message.trim() } : {}),
    ...(d.decision === 'ask_info' ? { p_info_request: d.request, p_info_step: d.step } : {}),
    ...(d.decision === 'reject' ? { p_reason: d.reason, p_allow_reapply: d.allowReapply } : {}),
  });
  if (error) {
    const m = error.message;
    if (m.includes('info_request_required')) return { ok: false, error: 'Write what you need from the applicant.' };
    if (m.includes('reason_required')) return { ok: false, error: 'Write a reason the applicant will see.' };
    if (m.includes('not_open')) return { ok: false, error: 'Someone already decided this application.' };
    if (m.includes('not_found')) return { ok: false, error: 'This application no longer exists.' };
    if (error.code === '42501') return { ok: false, error: 'Only publishers can decide applications.' };
    return { ok: false, error: "Couldn't save the decision. Try again." };
  }
  revalidatePath('/applications');
  revalidatePath('/authors');
  return { ok: true };
}

/** A 5-minute link to the writing sample in R2 (api Worker: GET /v1/author-applications/:id/sample). */
export async function sampleLink(
  applicationId: string,
): Promise<{ ok: true; url: string; name: string | null } | { ok: false; error: string }> {
  const r = await api<{ url: string; file_name: string | null }>(`/v1/author-applications/${applicationId}/sample`);
  if (!r.ok)
    return {
      ok: false,
      error: r.status === 404 ? 'This application has no sample file.' : r.error,
    };
  return { ok: true, url: r.data.url, name: r.data.file_name };
}
