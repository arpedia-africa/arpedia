// Desk session and calls. `desk login` signs in with Supabase Auth (password, then the two-step
// code when the account has one) and keeps the session in ~/.arpedia-desk/session.json; every
// other command refreshes it when needed and calls the api Worker's /v1/books/desk/* endpoints.
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Endpoints {
  supabaseUrl: string;
  anonKey: string;
  apiUrl: string;
}
export interface Session extends Endpoints {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

export const HOME = process.env.ARPEDIA_DESK_HOME ?? join(homedir(), '.arpedia-desk');
const SESSION = join(HOME, 'session.json');

export class DeskError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function json(res: Response) {
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = body?.error_description ?? body?.msg ?? body?.message ?? body?.error ?? res.statusText;
    throw new DeskError(String(msg), res.status);
  }
  return body;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  user: { id: string; email?: string; factors?: { id: string; factor_type: string; status: string }[] };
}

const auth = (e: Endpoints, path: string, body: unknown, token?: string) =>
  fetch(`${e.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: e.anonKey,
      Authorization: `Bearer ${token ?? e.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(json) as Promise<unknown>;

const toSession = (e: Endpoints, t: TokenResponse, email: string): Session => ({
  ...e,
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  expiresAt: t.expires_at ?? Math.floor(Date.now() / 1000) + t.expires_in,
  email,
});

function save(s: Session) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(SESSION, JSON.stringify(s, null, 2));
  try {
    chmodSync(SESSION, 0o600);
  } catch {
    // Windows: the user profile is already private.
  }
}

export async function login(
  e: Endpoints,
  email: string,
  password: string,
  askCode: () => Promise<string>,
): Promise<Session> {
  let t = (await auth(e, 'token?grant_type=password', { email, password })) as TokenResponse;
  const totp = t.user.factors?.find((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (totp) {
    const challenge = (await auth(e, `factors/${totp.id}/challenge`, {}, t.access_token)) as { id: string };
    const code = (await askCode()).trim();
    t = (await auth(
      e,
      `factors/${totp.id}/verify`,
      { challenge_id: challenge.id, code },
      t.access_token,
    )) as TokenResponse;
  }
  const s = toSession(e, t, email);
  const rpc = await fetch(`${e.supabaseUrl}/rest/v1/rpc/is_staff_any`, {
    method: 'POST',
    headers: {
      apikey: e.anonKey,
      Authorization: `Bearer ${s.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_roles: ['operations_admin', 'publisher'] }),
  }).then(json);
  if (rpc !== (true as unknown))
    throw new DeskError('This account is not on the desk (Operations admin or Publisher).', 403);
  save(s);
  return s;
}

export async function session(): Promise<Session> {
  if (!existsSync(SESSION)) throw new DeskError('Not signed in. Run `desk login` first.');
  let s = JSON.parse(readFileSync(SESSION, 'utf8')) as Session;
  if (s.expiresAt - 60 < Date.now() / 1000) {
    const t = (await auth(s, 'token?grant_type=refresh_token', { refresh_token: s.refreshToken }).catch(
      () => {
        throw new DeskError('Your session ended. Run `desk login` again.');
      },
    )) as TokenResponse;
    s = toSession(s, t, s.email);
    save(s);
  }
  return s;
}

/** POST to the api Worker's book routes as the signed-in staff member. */
export async function call<T>(s: Session, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${s.apiUrl}/v1/books${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await json(res)) as T;
}

/** PUT bytes to a Worker-signed upload link; the Worker has R2 check the hash. */
export async function put(url: string, bytes: Uint8Array) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Content-SHA256': createHash('sha256').update(bytes).digest('hex') },
    body: bytes,
  });
  await json(res);
}

export async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new DeskError(`Download failed (${res.status}).`, res.status);
  return new Uint8Array(await res.arrayBuffer());
}

/** Endpoints from flags, then the environment, then a local checkout's apps/admin/.env.local. */
export function endpoints(flags: Partial<Endpoints>, repoRoot: string): Endpoints {
  const local: Record<string, string> = {};
  const envFile = join(repoRoot, 'apps/admin/.env.local');
  if (existsSync(envFile))
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) local[m[1]!] = m[2]!;
    }
  const e = {
    supabaseUrl: flags.supabaseUrl ?? process.env.ARPEDIA_SUPABASE_URL ?? local.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: flags.anonKey ?? process.env.ARPEDIA_SUPABASE_ANON_KEY ?? local.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    apiUrl: flags.apiUrl ?? process.env.ARPEDIA_API_URL ?? local.ARPEDIA_API_URL,
  };
  if (!e.supabaseUrl || !e.anonKey || !e.apiUrl)
    throw new DeskError(
      'Set ARPEDIA_SUPABASE_URL, ARPEDIA_SUPABASE_ANON_KEY and ARPEDIA_API_URL (or pass --supabase-url, --anon-key, --api-url).',
    );
  return e as Endpoints;
}
