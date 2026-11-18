'use server';

import { revalidatePath } from 'next/cache';
import type { StaffRole } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

const failed = (message?: string): ActionResult => ({
  error: message && /Super admins/.test(message) ? 'There must always be at least 2 active Super admins.' : message && /own account/.test(message) ? "You can't disable your own account." : "That didn't save. Try again.",
});

/** s-team-invite: the Worker makes the one-time link, stores its hash and sends the email. */
export async function inviteStaff(email: string, fullName: string, role: StaffRole): Promise<ActionResult> {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@arpedia\.africa$/.test(clean)) return { error: 'Use an @arpedia.africa work email.' };
  if (!fullName.trim()) return { error: 'Enter their full name.' };
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Your session ended. Sign in again.' };
  let r: Response;
  try {
    r = await fetch(`${process.env.API_URL ?? 'http://127.0.0.1:8787'}/v1/staff-invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clean, full_name: fullName.trim(), role }),
    });
  } catch {
    return { error: 'No connection. Check your network and try again.' };
  }
  if (!r.ok) {
    const { error } = (await r.json().catch(() => ({}))) as { error?: string };
    if (error === 'already_staff') return { error: 'This person is already on the team.' };
    if (error === 'not_staff_domain') return { error: 'Use an @arpedia.africa work email.' };
    if (error === 'forbidden') return { error: 'Only Super admins can invite staff.' };
    return { error: "The invite didn't send. Try again." };
  }
  revalidatePath('/team');
  return { ok: true };
}

export async function changeRole(userId: string, role: StaffRole): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('change_staff_role', { p_user: userId, p_role: role });
  if (error) return failed(error.message);
  revalidatePath('/team');
  return { ok: true };
}

export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_staff_status', { p_user: userId, p_active: active });
  if (error) return failed(error.message);
  revalidatePath('/team');
  return { ok: true };
}

export async function resetTwoStep(userId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('reset_staff_mfa', { p_user: userId });
  if (error) return failed(error.message);
  revalidatePath('/team');
  return { ok: true };
}
