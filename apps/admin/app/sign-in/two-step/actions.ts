'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/staff';
import { TRUST_COOKIE, TRUST_SECONDS } from '@/lib/supabase/cookies';
import { serverSupabase } from '@/lib/supabase/server';

export interface CodeState {
  error?: string;
  /** Plain backup codes, shown once after setup. */
  codes?: string[];
}

const WRONG = "That code didn't work. Check your app and try again.";
const WRONG_BACKUP = "That backup code didn't work. Check it and try again. Each code works once.";
const LOCKED = 'Too many tries. Wait 10 minutes, then try again.';

const isLocked = (until: string | null) => !!until && new Date(until).getTime() > Date.now();

/** Remember the "Trust this browser for 12 hours" choice; the session cookies follow it. */
async function rememberTrust(trusted: boolean) {
  const store = await cookies();
  if (trusted) store.set(TRUST_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: TRUST_SECONDS,
    });
  else store.delete(TRUST_COOKIE);
}

/** s-signin-2fa: the 6-digit code from the authenticator app raises the session to AAL2. */
export async function verifyCode(_prev: CodeState, form: FormData): Promise<CodeState> {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  if (isLocked(staff.codeLockedUntil)) return { error: LOCKED };
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: 'Enter the 6-digit code from your app.' };
  const trusted = form.get('trust') === '1';
  await rememberTrust(trusted);

  const supabase = await serverSupabase({ trusted });
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find(f => f.status === 'verified');
  if (!factor) redirect('/sign-in/two-step/setup');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    await supabase.rpc('note_staff_code_failure');
    return { error: WRONG };
  }
  redirect('/');
}

/** "Use a backup code": one code verifies this session in place of an app code. */
export async function verifyBackupCode(_prev: CodeState, form: FormData): Promise<CodeState> {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  if (isLocked(staff.codeLockedUntil)) return { error: LOCKED };
  const code = String(form.get('backup') ?? '').trim();
  if (!code) return { error: 'Enter one of your backup codes.' };
  const trusted = form.get('trust') === '1';
  await rememberTrust(trusted);

  const supabase = await serverSupabase({ trusted });
  const { data: left, error } = await supabase.rpc('use_staff_backup_code', { p_code: code });
  if (error || left === null || left < 0) return { error: WRONG_BACKUP };
  redirect('/');
}

/** First visit: start authenticator enrolment. Returns the QR code and the key to type in. */
export async function startEnrolment(): Promise<{ id: string; qr: string; secret: string } | { error: string }> {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  const supabase = await serverSupabase();
  // A half-finished setup leaves an unverified factor behind; clear it so the new one can be added.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Arpedia Admin' });
  if (error || !data) return { error: "Two-step setup didn't start. Refresh the page and try again." };
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** First visit: confirm the new authenticator with a code, then make the 10 backup codes. */
export async function finishEnrolment(_prev: CodeState, form: FormData): Promise<CodeState> {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  const factorId = String(form.get('factor') ?? '');
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: 'Enter the 6-digit code from your app.' };
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    await supabase.rpc('note_staff_code_failure');
    return { error: WRONG };
  }
  const { data: codes, error: codesError } = await supabase.rpc('create_staff_backup_codes');
  if (codesError || !codes) return { error: "Your app is set up, but backup codes didn't generate. Make new ones in My account." };
  return { codes };
}
