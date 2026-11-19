import { PASSWORD_MIN } from '@arpedia/core';
import { Hono } from 'hono';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { rpcError, userDb } from '../12/http';

// Flow 10 · account actions that need Supabase Auth itself, not just Postgres.
//   POST /v1/account/password {current, new} → {ok}            (s-security, rule 29)
//     401 {error: 'wrong_password'}  the current password is wrong
//     400 {error: 'weak_password'}   the new one breaks the sign-up rule
//     409 {error: 'no_password'}     the reader only signs in with Google
//     Ends every other session of the reader; this one stays signed in.
//   POST /v1/account/readers/:id/password-reset → {email}       (admin s-user menu)
//     Staff only (staff_send_password_reset checks the role and writes the audit entry).
// erasePending() runs from the Worker cron and erases accounts whose deletion is due (rule 36).

const account = new Hono<AppEnv>();
account.use('*', requireUser);

account.post('/password', async (c) => {
  const body = await c.req
    .json<{ current?: unknown; new?: unknown }>()
    .catch(() => ({}) as Record<string, unknown>);
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.new === 'string' ? body.new : '';
  if (next.length < PASSWORD_MIN || next.length > 200) return c.json({ error: 'weak_password' }, 400);

  const user = c.get('user');
  const db = serviceDb(c.env);
  const { data: found, error: findError } = await db.auth.admin.getUserById(user.sub!);
  if (findError || !found.user?.email) return c.json({ error: 'not_found' }, 404);
  if (!found.user.identities?.some((i) => i.provider === 'email'))
    return c.json({ error: 'no_password' }, 409);

  // Re-authenticate with the current password (Supabase Auth's own rate limit applies).
  const check = await db.auth.signInWithPassword({ email: found.user.email, password: current });
  if (check.error || !check.data.session) {
    if (check.error?.status === 429) return c.json({ error: 'rate_limited' }, 429);
    return c.json({ error: 'wrong_password' }, 401);
  }

  const { error: updateError } = await db.auth.admin.updateUserById(user.sub!, { password: next });
  if (updateError) return c.json({ error: 'weak_password' }, 400);

  // Every session but this one (including the check session above) ends.
  const res = await fetch(`${c.env.SUPABASE_URL}/auth/v1/logout?scope=others`, {
    method: 'POST',
    headers: { apikey: c.env.SUPABASE_ANON_KEY, Authorization: c.req.header('Authorization')! },
  });
  if (!res.ok && res.status !== 204) throw new Error(`logout others failed: ${res.status}`);
  return c.json({ ok: true });
});

account.post('/readers/:id/password-reset', async (c) => {
  const id = c.req.param('id');
  const { data: email, error } = await userDb(c).rpc('staff_send_password_reset', { p_user: id });
  if (error) return rpcError(c, error);
  const { error: sendError } = await serviceDb(c.env).auth.resetPasswordForEmail(email);
  if (sendError && sendError.status !== 429) throw new Error(`reset email failed: ${sendError.message}`);
  return c.json({ email });
});

/** Erase up to 5 due accounts per tick; a failure leaves that one for the next tick. */
export async function erasePending(env: Env) {
  const db = serviceDb(env);
  const { data: due, error } = await db.rpc('due_account_deletions', { p_limit: 5 });
  if (error) throw new Error(`due_account_deletions failed: ${error.message}`);
  for (const id of due ?? []) {
    const { error: eraseError } = await db.rpc('erase_account', { p_deletion: id });
    if (eraseError) console.error(`erase_account ${id} failed: ${eraseError.message}`);
  }
}

export default account;
