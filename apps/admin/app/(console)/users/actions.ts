'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

// Flow 10 · staff actions on a reader. Every RPC checks the role and writes the audit log.

export interface ActionResult {
  ok?: boolean;
  error?: string;
  /** Extra answer (an email address, a revealed phone, a device count). */
  value?: string;
}

const failed = (message?: string): ActionResult => ({
  error: /Not allowed/.test(message ?? '')
    ? "Your role can't do this."
    : /earnings_waiting/.test(message ?? '')
      ? 'This author has earnings waiting. Delete after their next payout.'
      : /reason_required/.test(message ?? '')
        ? 'Add a short reason.'
        : /confirm_text/.test(message ?? '')
          ? 'Type DELETE to confirm.'
          : "That didn't save. Try again.",
});

const done = (id: string) => {
  revalidatePath(`/users/${id}`);
  revalidatePath(`/users/${id}/activity`);
  revalidatePath('/users');
};

/** The api Worker sends the email; the RPC behind it checks the role and audits. */
export async function sendPasswordReset(userId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Your session ended. Sign in again.' };
  try {
    const r = await fetch(`${process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787'}/v1/account/readers/${userId}/password-reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = (await r.json().catch(() => ({}))) as { email?: string; error?: string };
    if (!r.ok) return failed(body.error);
    return { ok: true, value: body.email };
  } catch {
    return { error: 'No connection. Check your network and try again.' };
  }
}

export async function signOutAll(userId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_sign_out_all', { p_user: userId });
  if (error) return failed(error.message);
  done(userId);
  return { ok: true, value: String(data ?? 0) };
}

export async function signOutDevice(userId: string, deviceId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_sign_out_device', { p_user: userId, p_device: deviceId });
  if (error) return failed(error.message);
  done(userId);
  return { ok: true };
}

export async function setRole(userId: string, role: 'reader' | 'author'): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_set_reader_role', { p_user: userId, p_role: role });
  if (error) return failed(error.message);
  done(userId);
  return { ok: true };
}

export async function addNote(userId: string, body: string): Promise<ActionResult> {
  if (!body.trim()) return { error: 'Write the note first.' };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_add_note', { p_user: userId, p_body: body });
  if (error) return failed(error.message);
  done(userId);
  return { ok: true };
}

export async function revealContact(userId: string, reason: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_reveal_contact', { p_user: userId, p_reason: reason });
  if (error) return failed(error.message);
  const c = data as unknown as { phone: string | null };
  return { ok: true, value: c.phone ?? 'No phone' };
}

export async function startDeletion(
  userId: string,
  mode: 'now' | 'after_30_days',
  reason: string,
  confirm: string,
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_start_deletion', {
    p_user: userId,
    p_mode: mode,
    p_reason: reason,
    p_confirm: confirm,
  });
  if (error) return failed(error.message);
  done(userId);
  const d = data as unknown as { erase_after: string };
  return { ok: true, value: d.erase_after };
}

export async function cancelDeletion(userId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_cancel_deletion', { p_user: userId, p_reason: 'Undo from the reader page' });
  if (error) return failed(error.message);
  done(userId);
  return { ok: true };
}
