import { supabase } from '@/lib/supabase';
import { AccountDeleted } from './session';

const api = process.env.EXPO_PUBLIC_API_URL ?? '';

type Result = Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
type Failure = { status: number; name?: string; message: string };

const fail = (error: Failure) => ({ data: { user: null, session: null }, error }) as unknown as Result;

/**
 * Email log-in (rule 9) through the api Worker, which counts wrong passwords per email and locks
 * that email for 15 minutes after 5 (spec check 01-3). Same result shape as supabase-js
 * `signInWithPassword`, so `isNetworkError` / `isRateLimited` read it: the lock answers 429 like
 * Supabase's own limit, a dead network status 0. Without an api URL (local tools) it signs in
 * directly.
 */
export async function signInWithPassword(email: string, password: string): Promise<Result> {
  if (!api) return supabase.auth.signInWithPassword({ email, password });
  let res: Response;
  try {
    res = await fetch(`${api}/v1/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return fail({ status: 0, name: 'AuthRetryableFetchError', message: 'Network request failed' });
  }
  if (res.status === 423 || res.status === 429) return fail({ status: 429, message: 'Too many tries' });
  // Right password, deleted account (the Worker checks the password before it says so).
  if (res.status === 403) throw new AccountDeleted();
  if (!res.ok) {
    // 401 is a wrong email or password; a Worker fault is not the reader's typing.
    if (res.status === 401) return fail({ status: 400, message: 'Invalid login credentials' });
    throw new Error(`sign-in ${res.status}`);
  }
  const tokens = (await res.json()) as { access_token: string; refresh_token: string };
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error) throw error;
  if (!data.user || !data.session) throw new Error('sign-in: no session');
  // A good password clears this email's failures (the same lockout as staff sign-in).
  void supabase.rpc('clear_staff_signin_failures').then(undefined, () => undefined);
  return { data: { user: data.user, session: data.session }, error: null } as Result;
}
