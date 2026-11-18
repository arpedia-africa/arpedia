'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { STAFF_PASSWORD_MIN } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

export interface ResetState {
  sentTo?: string;
  error?: string;
}

/** s-signin-reset: the same reply for every email, so nobody can probe for staff accounts (rule 7). */
export async function sendReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter your work email.' };
  const supabase = await serverSupabase();
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3000';
  // Errors (unknown email, rate limit) are not shown: the reply never says whether the account exists.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/sign-in/reset/callback` });
  return { sentTo: email };
}

export interface NewPasswordState {
  error?: string;
}

/** New password from the reset link: 12+ characters, other sessions end, two-step still follows. */
export async function setNewPassword(_prev: NewPasswordState, form: FormData): Promise<NewPasswordState> {
  const password = String(form.get('password') ?? '');
  if (password.length < STAFF_PASSWORD_MIN) return { error: `Use at least ${STAFF_PASSWORD_MIN} characters.` };
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: /different|same/i.test(error.message)
        ? 'Choose a password you haven’t used here before.'
        : 'This link has expired. Ask for a new one.',
    };
  }
  await supabase.auth.signOut({ scope: 'others' });
  redirect('/sign-in/two-step');
}
