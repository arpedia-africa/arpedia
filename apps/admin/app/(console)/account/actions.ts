'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { getStaff, STAFF_PASSWORD_MIN } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

/** Full name and the optional phone for urgent alerts (+234 numbers are stored with the code). */
export async function saveProfile(name: string, phone: string): Promise<Result> {
  const supabase = await serverSupabase();
  const digits = phone.replace(/\D/g, '');
  const full = digits ? `+234${digits.replace(/^(234|0)/, '')}` : '';
  const { error } = await supabase.rpc('update_my_staff_profile', { p_name: name, p_phone: full });
  if (error) {
    if (error.message === 'bad_name') return { ok: false, error: 'Enter your full name (2 to 80 characters).' };
    if (error.message === 'bad_phone') return { ok: false, error: 'Enter a Nigerian phone number, like 803 555 0142.' };
    return { ok: false, error: "Couldn't save your profile. Try again." };
  }
  revalidatePath('/account');
  return { ok: true };
}

/** Turn one staff alert on or off. High-severity reports always alert. */
export async function setAlert(kind: string, enabled: boolean): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_my_alert_pref', { p_kind: kind, p_enabled: enabled });
  if (error) {
    if (error.message === 'alert_required') return { ok: false, error: 'High-severity reports always alert you.' };
    return { ok: false, error: "Couldn't change that alert. Try again." };
  }
  revalidatePath('/account');
  return { ok: true };
}

/** Sign out one session, or every session but this one (no id). */
export async function signOutSessions(session?: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('sign_out_my_sessions', session ? { p_session: session } : {});
  if (error) return { ok: false, error: "Couldn't sign that session out. Try again." };
  revalidatePath('/account');
  return { ok: true, count: data ?? 0 };
}

/** Ten new backup codes, shown once. The old ones stop working. */
export async function regenerateCodes(): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('create_staff_backup_codes');
  if (error || !data) return { ok: false, error: "Couldn't make new codes. Sign in again with your app code, then retry." };
  revalidatePath('/account');
  return { ok: true, codes: data };
}

/** Change phone, step 1: a new authenticator to scan (the current one keeps working until step 2). */
export async function startNewAuthenticator(): Promise<{ id: string; qr: string; secret: string } | { error: string }> {
  const supabase = await serverSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Arpedia Admin ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: "Setup didn't start. Refresh the page and try again." };
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Change phone, step 2: confirm the new app with a code, then remove the old one. */
export async function finishNewAuthenticator(factorId: string, code: string): Promise<Result> {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6) return { ok: false, error: 'Enter the 6-digit code from your new app.' };
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
  if (error) {
    await supabase.rpc('note_staff_code_failure');
    return { ok: false, error: "That code didn't work. Check your new app and try again." };
  }
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.totp ?? []) {
    if (f.id !== factorId) await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  revalidatePath('/account');
  return { ok: true };
}

/**
 * Change password: check the current one on a throwaway client (no cookies), set the new one,
 * then sign out every other session (rule 7).
 */
export async function changePassword(current: string, next: string, repeat: string): Promise<Result> {
  if (next.length < STAFF_PASSWORD_MIN) return { ok: false, error: `Use at least ${STAFF_PASSWORD_MIN} characters.` };
  if (next !== repeat) return { ok: false, error: "The new passwords don't match." };
  if (next === current) return { ok: false, error: 'Choose a password you have not used here.' };
  const staff = await getStaff();
  if (!staff) return { ok: false, error: 'Sign in again, then retry.' };
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrong } = await check.auth.signInWithPassword({ email: staff.email, password: current });
  if (wrong) return { ok: false, error: "Your current password isn't right." };
  // That check made a session; sign_out_my_sessions below removes it with the other ones.
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: "Couldn't change your password. Try again." };
  await supabase.rpc('sign_out_my_sessions', {});
  revalidatePath('/account');
  return { ok: true };
}
