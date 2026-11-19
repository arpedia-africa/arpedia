'use server';

import { redirect } from 'next/navigation';
import { STAFF_PASSWORD_MIN } from '@/lib/staff-rules';
import { serverSupabase } from '@/lib/supabase/server';

export interface AcceptState {
  error?: string;
}

/** Create the account from the invite, sign in, and go straight to authenticator setup. */
export async function acceptInvite(_prev: AcceptState, form: FormData): Promise<AcceptState> {
  const token = String(form.get('token') ?? '');
  const password = String(form.get('password') ?? '');
  if (password.length < STAFF_PASSWORD_MIN) return { error: `Use at least ${STAFF_PASSWORD_MIN} characters.` };
  let r: Response;
  try {
    r = await fetch(`${process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787'}/v1/staff-invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { error: 'No connection. Check your network and try again.' };
  }
  const body = (await r.json().catch(() => ({}))) as { email?: string; error?: string };
  if (!r.ok || !body.email) {
    if (body.error === 'account_exists')
      return { error: 'This email already has an Arpedia account. Ask a Super admin to add it to the team.' };
    return { error: 'This invite link has expired or was already used. Ask for a new one.' };
  }
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: body.email, password });
  if (error) redirect('/sign-in');
  redirect('/sign-in/two-step/setup');
}
