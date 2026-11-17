'use server';

import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

export interface SignInState {
  error?: string;
  email?: string;
}

// Same message for a wrong password and for someone who isn't staff, so the form never reveals
// which emails have staff accounts (flow 16 rule 1).
const REFUSED = "That email and password don't match. Check them and try again.";

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your work email and password.', email };

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: REFUSED, email };

  const staff = await getStaff();
  if (!staff) {
    await supabase.auth.signOut();
    return { error: REFUSED, email };
  }
  redirect('/');
}

export async function signOut() {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
