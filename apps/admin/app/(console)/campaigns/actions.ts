'use server';

import { revalidatePath } from 'next/cache';
import type { Json } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';
import type { Audience, Reach, Target } from './labels';

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

/** The RPCs raise plain sentences for staff; anything else gets the generic line. */
const failed = (message?: string): ActionResult => {
  if (message && /insufficient|Not allowed/i.test(message)) return { error: "Your role can't do that." };
  if (
    message &&
    /^(Only|Add a|Pick a|Choose|Say why|Second title|Title is|Message is|This push|Someone other|Unknown app|Wording|This notification)/.test(
      message,
    )
  )
    return { error: message.endsWith('.') ? message : `${message}.` };
  return { error: "That didn't save. Try again." };
};

const done = (): ActionResult => {
  revalidatePath('/campaigns');
  return { ok: true };
};

export async function duplicateCampaign(id: string, unopened: boolean): Promise<ActionResult & { id?: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_duplicate_campaign', { p_id: id, p_unopened: unopened });
  if (error) return failed(error.message);
  return { ...done(), id: data };
}

export async function pauseCampaign(id: string) {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_pause_campaign', { p_id: id });
  return error ? failed(error.message) : done();
}

export async function cancelCampaign(id: string) {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_cancel_campaign', { p_id: id });
  return error ? failed(error.message) : done();
}

export async function restoreCampaign(id: string) {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_restore_campaign', { p_id: id });
  return error ? failed(error.message) : done();
}

export async function deleteDraft(id: string) {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_delete_campaign_draft', { p_id: id });
  return error ? failed(error.message) : done();
}

export async function setPushType(key: string, fields: { enabled?: boolean; title?: string; body?: string }) {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_set_push_type', {
    p_key: key,
    p_enabled: fields.enabled,
    p_title: fields.title,
    p_body: fields.body,
  });
  return error ? failed(error.message) : done();
}

export interface Draft {
  title: string;
  body: string;
  audience: Audience;
  open_target: Target;
  skip_capped: boolean;
  respect_quiet: boolean;
  quiet_override_reason?: string;
  ab_test: { title_b: string; split: number } | null;
}

export async function saveDraft(id: string | null, draft: Draft): Promise<ActionResult & { id?: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_save_campaign', {
    // null creates a new draft (the generated type can't say a uuid argument may be null).
    p_id: id as string,
    p_fields: draft as unknown as Json,
  });
  if (error) return failed(error.message);
  revalidatePath('/campaigns');
  return { ok: true, id: data };
}

export async function reachFor(audience: Audience, skipCapped: boolean): Promise<Reach | null> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('campaign_reach', {
    p_audience: audience as unknown as Json,
    p_skip_capped: skipCapped,
  });
  return error ? null : (data as unknown as Reach);
}

export interface ScheduleResult extends ActionResult {
  needsConfirm?: boolean;
  needsReview?: boolean;
  reach?: number;
  sendAt?: string;
  moved?: boolean;
}

/** Save, then schedule (sendAt null = now). Above 1,000 readers the first call only asks to confirm. */
export async function schedule(
  id: string | null,
  draft: Draft,
  sendAt: string | null,
  confirm: boolean,
): Promise<ScheduleResult & { id?: string }> {
  const saved = await saveDraft(id, draft);
  if (!saved.ok || !saved.id) return saved;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_schedule_campaign', {
    p_id: saved.id,
    p_send_at: sendAt ?? undefined,
    p_confirm: confirm,
  });
  if (error) return { ...failed(error.message), id: saved.id };
  const r = data as { needs_confirm?: boolean; needs_review?: boolean; reach: number; send_at?: string; moved?: boolean };
  revalidatePath('/campaigns');
  return {
    ok: !r.needs_confirm && !r.needs_review,
    id: saved.id,
    needsConfirm: r.needs_confirm,
    needsReview: r.needs_review,
    reach: r.reach,
    sendAt: r.send_at,
    moved: r.moved,
  };
}

export async function requestReview(id: string | null, draft: Draft): Promise<ActionResult & { id?: string }> {
  const saved = await saveDraft(id, draft);
  if (!saved.ok || !saved.id) return saved;
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_request_campaign_review', { p_id: saved.id });
  if (error) return { ...failed(error.message), id: saved.id };
  return { ...done(), id: saved.id };
}

export async function reviewCampaign(id: string) {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_review_campaign', { p_id: id });
  return error ? failed(error.message) : done();
}

export async function testPush(id: string | null, draft: Draft): Promise<ActionResult & { id?: string; noDevice?: boolean }> {
  const saved = await saveDraft(id, draft);
  if (!saved.ok || !saved.id) return saved;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_test_push', { p_id: saved.id });
  if (error) return { ...failed(error.message), id: saved.id };
  return { ok: !!data, noDevice: !data, id: saved.id };
}
