'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getStaff, STAFF_DOMAIN } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

export interface SignInState {
  error?: string;
  email?: string;
}

// Same message for a wrong password and for someone who isn't staff, so the form never reveals
// which emails have staff accounts (flow 16 rule 1).
const REFUSED = "That email and password don't match. Check them and try again.";
const LOCKED = 'Too many tries. Try again in 15 minutes or reset your password.';

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your work email and password.', email };

  const supabase = await serverSupabase();
  // 5 wrong passwords in 15 minutes lock the email (flow 16 rule 8), staff or not.
  const { data: locked } = await supabase.rpc('staff_signin_locked', { p_email: email });
  if (locked) return { error: LOCKED, email };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await supabase.rpc('note_staff_signin_failure', { p_email: email });
    return { error: REFUSED, email };
  }

  const staff = await getStaff();
  if (!staff) {
    // `local` drops the session cookies before the network call, so a refused account never keeps one.
    await supabase.auth.signOut({ scope: 'local' });
    return { error: REFUSED, email };
  }
  await supabase.rpc('clear_staff_signin_failures');
  // Every password sign-in continues to two-step (rule 2); the console layout sends unenrolled
  // staff on to authenticator setup.
  redirect(staff.mfaEnrolled ? '/sign-in/two-step' : '/sign-in/two-step/setup');
}

/** Continue with Google, limited to @arpedia.africa accounts (hd hint here, enforced in callback/route.ts). */
export async function signInWithGoogle() {
  const supabase = await serverSupabase();
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3000';
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/sign-in/callback`,
      queryParams: { hd: STAFF_DOMAIN, prompt: 'select_account' },
    },
  });
  if (error || !data.url) redirect('/sign-in?error=google');
  redirect(data.url);
}

export async function signOut() {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
