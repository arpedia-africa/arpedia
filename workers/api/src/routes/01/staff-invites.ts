import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import type { Database, StaffRole } from '@arpedia/core';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';

// Flow 01 · flow 16 pass 1: staff invites (rule 14).
//   POST /v1/staff-invites {email, full_name, role}  (Super admin with two-step) → {id, expires_at}
//   GET  /v1/staff-invites/:token                    → {email, full_name, role, state}
//   POST /v1/staff-invites/:token/accept {password}  → {email}: creates the account, joins the team
// The token is 32 random bytes; only its SHA-256 is stored. The email goes out through Resend
// when RESEND_API_KEY is set; otherwise (local) the link is logged and returned in the response.

const PASSWORD_MIN = 12;
const ROLES: StaffRole[] = [
  'super_admin',
  'operations_admin',
  'publisher',
  'moderator',
  'finance',
  'support',
  'analyst',
];
const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  operations_admin: 'Operations admin',
  publisher: 'Publisher',
  moderator: 'Moderator',
  finance: 'Finance',
  support: 'Support',
  analyst: 'Analyst',
};

const invites = new Hono<AppEnv>();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** Acts as the signed-in staff member, so has_permission() sees their role and two-step. */
function callerDb(env: Env, token: string) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (...args) => fetch(...args) },
  });
}

async function sendInviteEmail(env: Env, to: string, name: string, role: StaffRole, link: string) {
  if (!env.RESEND_API_KEY) {
    console.log(`[staff-invite] ${to} (${ROLE_LABEL[role]}): ${link}`);
    return false;
  }
  const first = name.split(/\s+/)[0] ?? name;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Arpedia Admin <admin@arpedia.africa>',
      to,
      subject: 'You’re invited to Arpedia Admin',
      text:
        `Hi ${first},\n\nYou’ve been invited to the Arpedia staff console as ${ROLE_LABEL[role]}.\n\n` +
        `Create your password and set up two-step sign-in here:\n${link}\n\n` +
        `The link works once and expires in 72 hours. If you weren’t expecting this, ignore this email.`,
    }),
  });
  if (!r.ok) throw new Error(`invite email failed: ${r.status}`);
  return true;
}

invites.post('/', requireUser, async (c) => {
  const body = await c.req
    .json<{ email?: string; full_name?: string; role?: string }>()
    .catch(() => ({}) as { email?: string; full_name?: string; role?: string });
  const email = (body.email ?? '').trim().toLowerCase();
  const name = (body.full_name ?? '').trim();
  const role = body.role as StaffRole;
  if (!/^[^@\s]+@arpedia\.africa$/.test(email)) return c.json({ error: 'not_staff_domain' }, 400);
  if (!name || name.length > 80) return c.json({ error: 'bad_name' }, 400);
  if (!ROLES.includes(role)) return c.json({ error: 'bad_role' }, 400);
  // Off the local stack a missing ADMIN_URL would email a dead localhost link.
  if (!c.env.ADMIN_URL && c.env.APP_ENV !== 'local') throw new Error('ADMIN_URL is not set');

  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const jwt = c.req.header('Authorization')!.slice('Bearer '.length);
  const { data: id, error } = await callerDb(c.env, jwt).rpc('invite_staff', {
    p_email: email,
    p_name: name,
    p_role: role,
    p_token_hash: await sha256(token),
  });
  if (error) {
    if (error.code === '42501') return c.json({ error: 'forbidden' }, 403);
    if (error.code === '23505') return c.json({ error: 'already_staff' }, 409);
    if (error.code === '23514') return c.json({ error: 'not_staff_domain' }, 400);
    throw new Error(`invite_staff failed: ${error.message}`);
  }
  const link = `${c.env.ADMIN_URL ?? 'http://localhost:3000'}/invite/${token}`;
  let emailed: boolean;
  try {
    emailed = await sendInviteEmail(c.env, email, name, role, link);
  } catch (e) {
    // Nobody holds this token, so cancel the invite rather than leave a dead "Invited" row.
    await callerDb(c.env, jwt).rpc('revoke_staff_invite', { p_invite: id as string });
    console.error(e);
    return c.json({ error: 'email_failed' }, 502);
  }
  return c.json({
    id,
    expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
    emailed,
    // Only on the local stack, so tests and the developer can open the link without email.
    ...(c.env.APP_ENV === 'local' ? { link } : {}),
  });
});

invites.get('/:token', async (c) => {
  const { data, error } = await serviceDb(c.env).rpc('get_staff_invite', {
    p_token_hash: await sha256(c.req.param('token')),
  });
  if (error) throw new Error(`get_staff_invite failed: ${error.message}`);
  if (!data) return c.json({ error: 'not_found' }, 404);
  return c.json(data);
});

invites.post('/:token/accept', async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  const password = body.password ?? '';
  if (password.length < PASSWORD_MIN) return c.json({ error: 'password_too_short' }, 400);
  const hash = await sha256(c.req.param('token'));
  const db = serviceDb(c.env);
  const { data: invite } = await db.rpc('get_staff_invite', { p_token_hash: hash });
  const inv = invite as { email: string; full_name: string; state: string } | null;
  if (!inv || inv.state !== 'open') return c.json({ error: 'expired' }, 410);

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: inv.full_name },
  });
  // An existing account on this address (rare: a reader who used their work email) is not taken
  // over here; a Super admin sorts it out by hand.
  if (createError || !created.user) return c.json({ error: 'account_exists' }, 409);

  const { error } = await db.rpc('accept_staff_invite', { p_token_hash: hash, p_user: created.user.id });
  if (error) {
    await db.auth.admin.deleteUser(created.user.id);
    return c.json({ error: 'expired' }, 410);
  }
  return c.json({ email: inv.email });
});

export default invites;
