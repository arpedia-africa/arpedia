import { Hono } from 'hono';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';

// Flow 01 · flow 16 pass 1: staff password sign-in with the rule 8 lockout.
//   POST /v1/staff-sign-in {email, password} → {access_token, refresh_token}
//     423 {error: 'locked'}   5 wrong passwords for this email in 15 minutes
//     401 {error: 'refused'}  wrong email or password (counted)
//     429 {error: 'rate_limited'}  Supabase Auth's own limit (not counted)
// The admin console sets the returned session on its cookies. Failures are noted here, after a
// real password check, so the lockout RPCs stay service-role only and nobody can lock a staff
// email out without trying passwords. Staff-or-not is decided by the console afterwards, so the
// answer never reveals which emails are staff.

const signIn = new Hono<AppEnv>();

signIn.post('/', async (c) => {
  const body = await c.req
    .json<{ email?: unknown; password?: unknown }>()
    .catch(() => ({}) as { email?: unknown; password?: unknown });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || email.length > 320 || !password || password.length > 200)
    return c.json({ error: 'refused' }, 401);

  const db = serviceDb(c.env);
  const { data: locked, error: lockError } = await db.rpc('staff_signin_locked', { p_email: email });
  if (lockError) throw new Error(`staff_signin_locked failed: ${lockError.message}`);
  if (locked) return c.json({ error: 'locked' }, 423);

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    if (error?.status === 429) return c.json({ error: 'rate_limited' }, 429);
    const { error: noteError } = await db.rpc('note_staff_signin_failure', { p_email: email });
    if (noteError) throw new Error(`note_staff_signin_failure failed: ${noteError.message}`);
    return c.json({ error: 'refused' }, 401);
  }
  return c.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});

export default signIn;
