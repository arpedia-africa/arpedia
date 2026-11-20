'use server';

import { revalidatePath } from 'next/cache';
import { stepUp, stepUpError } from '@/lib/stepup';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

const ROLE = 'Only a Super admin can change policies.';

/** Start a draft from the published text, or save the draft as it is typed. */
export async function saveDraft(policy: string, body: string | null, summary: string | null): Promise<Result> {
  const supabase = await serverSupabase();
  let text = body;
  if (text === null) {
    const { data } = await supabase
      .from('policy_versions')
      .select('body')
      .eq('policy_id', policy)
      .eq('status', 'published')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    text = data?.body ?? '';
  }
  const { error } = await supabase.rpc('save_policy_draft', {
    p_policy: policy,
    p_body: text,
    p_change_summary: summary ?? undefined,
  });
  if (error) return { ok: false, error: error.code === '42501' ? ROLE : "Couldn't save the draft. Try again." };
  revalidatePath('/policies');
  return { ok: true };
}

/** "Accept again on change" switch (applies to the next published version). */
export async function setAcceptAgain(policy: string, on: boolean): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_policy_accept_again', { p_policy: policy, p_on: on });
  if (error) return { ok: false, error: error.code === '42501' ? ROLE : "Couldn't change the switch. Try again." };
  revalidatePath('/policies');
  return { ok: true };
}

const PUBLISH_ERRORS: Record<string, string> = {
  no_draft: 'There is no draft to publish. Start one with Edit draft.',
  summary_required: 'Write what changed in one or two sentences (at least 10 characters).',
  body_required: 'The draft is nearly empty. Add the policy text before publishing.',
};

/** Publish the draft as a new version: fresh 2-step code, a short "what changed" (rule 38). */
export async function publishPolicy(policy: string, summary: string, acceptAgain: boolean, otp: string): Promise<Result> {
  const step = await stepUp(otp, 'publish_policy');
  if ('error' in step) return { ok: false, error: step.error };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('publish_policy', {
    p_policy: policy,
    p_change_summary: summary,
    p_accept_again: acceptAgain,
    p_stepup: step.id,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, error: ROLE };
    return {
      ok: false,
      error: PUBLISH_ERRORS[error.message] ?? stepUpError(error.message) ?? "Couldn't publish. Nothing changed. Try again.",
    };
  }
  revalidatePath('/policies');
  return { ok: true };
}
