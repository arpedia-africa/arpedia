'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
  suggest?: string | null;
  banPending?: boolean;
}

const failed = (message?: string): ActionResult => {
  const m = message ?? '';
  if (m.startsWith('already_decided:'))
    return { error: `${m.slice('already_decided:'.length)} already decided this.` };
  if (m.includes('own_content')) return { error: "You can't decide a report about your own content." };
  if (m.includes('reason_required')) return { error: 'Add a reason first.' };
  if (m.includes('not allowed') || m.includes('Not allowed'))
    return { error: 'Your role can read reports but not decide them.' };
  if (m.includes('second_person')) return { error: 'Another Super admin has to confirm a ban you decided.' };
  return { error: "That didn't save. Nothing changed. Try again." };
};

/** Tell the conversation's Durable Object to re-read Postgres (hidden or removed message, muted user). */
async function pushToChat(groupId: string | null | undefined) {
  if (!groupId) return;
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  try {
    await fetch(`${process.env.CHAT_URL ?? 'http://127.0.0.1:8788'}/c/${groupId}/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // Postgres already enforces the decision; open sockets re-check within 60 s.
  }
}

export async function decideReport(
  reportId: string,
  decision: 'keep' | 'remove' | 'spoiler' | 'action',
  opts: {
    action?: 'warn' | 'mute' | 'suspend' | 'ban';
    days?: number;
    reason?: string;
    note?: string;
    message?: string;
    notifyReporters?: boolean;
  } = {},
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_decide_report', {
    p_report: reportId,
    p_decision: decision,
    p_action: opts.action,
    p_duration_days: opts.days,
    p_reason: opts.reason ?? (decision === 'keep' ? undefined : 'Breaks the community rules'),
    p_internal_note: opts.note,
    p_message_to_user: opts.message,
    p_notify_reporters: opts.notifyReporters ?? true,
  });
  if (error) return failed(error.message);
  const res = data as { group_id?: string | null; suggest?: string | null; ban_pending?: boolean };
  await pushToChat(res.group_id);
  revalidatePath('/reports');
  return { ok: true, suggest: res.suggest ?? null, banPending: !!res.ban_pending };
}

export async function assignToMe(reportId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('assign_report', { p_report: reportId });
  if (error) return failed(error.message);
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

/** Change a report's severity (rule 4): every open report on the same content moves, and its due time follows. */
export async function setSeverity(reportId: string, severity: 'high' | 'medium' | 'low'): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_report_severity', { p_report: reportId, p_severity: severity });
  if (error) return failed(error.message);
  revalidatePath(`/reports/${reportId}`);
  revalidatePath('/reports');
  return { ok: true };
}

export async function escalate(reportId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('escalate_report', { p_report: reportId });
  if (error) return failed(error.message);
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

/** A Super admin confirms or turns down a ban another moderator decided (rule 17). */
export async function confirmBan(actionId: string, confirm: boolean, reportId?: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('confirm_ban', { p_action: actionId, p_confirm: confirm });
  if (error) return failed(error.message);
  revalidatePath('/');
  if (reportId) revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}
