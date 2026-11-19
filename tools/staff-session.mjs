// Local staff sessions for smoke tests: password sign-in, then two-step with the seeded TOTP secret.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { totp } from './totp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** API_URL, ANON_KEY… of the running local Supabase stack. */
export function localEnv() {
  // SUPABASE_WORKDIR points at a private stack (e.g. .shots/sb15) when db.lock is held by someone else.
  const workdir = process.env.SUPABASE_WORKDIR ? ` --workdir ${process.env.SUPABASE_WORKDIR}` : '';
  const out = execSync(`pnpm -s exec supabase status -o env${workdir}`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** Password session (AAL1) for a seeded account (password `arpedia-local`). */
export async function passwordSession(env, email, password = 'arpedia-local') {
  const r = await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const s = await r.json();
  if (!s.access_token)
    throw new Error(`sign-in failed for ${email}: ${s.msg ?? s.error_description ?? r.status}`);
  return s;
}

/** Raise a password session to AAL2 with the seeded authenticator. Returns the new session. */
export async function verifyTwoStep(env, s) {
  const h = {
    apikey: env.ANON_KEY,
    Authorization: `Bearer ${s.access_token}`,
    'Content-Type': 'application/json',
  };
  const factor = (s.user?.factors ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (!factor) throw new Error('no verified TOTP factor');
  const c = await (
    await fetch(`${env.API_URL}/auth/v1/factors/${factor.id}/challenge`, {
      method: 'POST',
      headers: h,
      body: '{}',
    })
  ).json();
  if (!c.id) throw new Error(`challenge failed: ${JSON.stringify(c)}`);
  const v = await fetch(`${env.API_URL}/auth/v1/factors/${factor.id}/verify`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ challenge_id: c.id, code: totp() }),
  });
  const s2 = await v.json();
  if (!s2.access_token) throw new Error(`verify failed: ${JSON.stringify(s2)}`);
  return s2;
}

/** Signed-in staff session that has passed two-step. */
export async function staffSession(env, email) {
  return verifyTwoStep(env, await passwordSession(env, email));
}
