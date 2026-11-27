import { Hono } from 'hono';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';

// Flow 01 · flow 16 pass 1: password sign-in with the lockout (staff rule 8, reader rule 9).
//   POST /v1/staff-sign-in {email, password} → {access_token, refresh_token}   (admin console)
//   POST /v1/sign-in       {email, password} → same                            (app, spec check 01-3)
//     423 {error: 'locked'}   5 wrong passwords for this email in 15 minutes
//     401 {error: 'refused'}  wrong email or password (counted)
//     429 {error: 'rate_limited'}  Supabase Auth's own limit (not counted)
//     403 {error: 'deleted'}  right password, account deleted (banned) and not yet erased (not counted)
// One lockout per email for both doors, so trying passwords on one does not reset the other.
// The caller sets the returned session and then clears its email's failures
// (`clear_staff_signin_failures`). Failures are noted here, after a real password check, so the
// lockout RPCs stay service-role only and nobody can lock an email out without trying passwords.
// Staff-or-not is decided by the console afterwards, so the answer never reveals which emails are
// staff. Supabase Auth sees the caller's IP through Sb-Forwarded-For (service key only), so its
// per-IP limit is not shared by everyone behind this Worker.

const signIn = new Hono<AppEnv>();

signIn.post('/', async (c) => {
  const body = await c.req
    .json<{ email?: unknown; password?: unknown }>()
    .catch(() => ({}) as { email?: unknown; password?: unknown });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || email.length > 320 || !password || password.length > 200)
    return c.json({ error: 'refused' }, 401);

  const ip = c.req.header('CF-Connecting-IP');
  const db = serviceDb(c.env, ip ? { 'Sb-Forwarded-For': ip } : undefined);
  const { data: locked, error: lockError } = await db.rpc('staff_signin_locked', { p_email: email });
  if (lockError) throw new Error(`staff_signin_locked failed: ${lockError.message}`);
  if (locked) return c.json({ error: 'locked' }, 423);

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    if (error?.status === 429) return c.json({ error: 'rate_limited' }, 429);
    // Only a real wrong password counts: an Auth outage must not lock readers out.
    if (error && error.status !== 400) throw new Error(`sign-in failed: ${error.status} ${error.message}`);
    // A deleted account is banned, and Auth says so for any password: tell only the owner.
    if (error?.code === 'user_banned') {
      const { data: reason, error: reasonError } = await db.rpc('banned_sign_in_reason', {
        p_email: email,
        p_password: password,
      });
      if (reasonError) throw new Error(`banned_sign_in_reason failed: ${reasonError.message}`);
      if (reason === 'deleted') return c.json({ error: 'deleted' }, 403);
    }
    const { error: noteError } = await db.rpc('note_staff_signin_failure', { p_email: email });
    if (noteError) throw new Error(`note_staff_signin_failure failed: ${noteError.message}`);
    return c.json({ error: 'refused' }, 401);
  }
  return c.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});

export default signIn;
