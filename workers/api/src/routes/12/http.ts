// Shared bits of the book routes: RPC errors as HTTP statuses and a client that acts as the caller.
import type { Database } from '@arpedia/core';
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import type { AppEnv } from '../../env';
import { signUpload } from './tokens';

/** PostgREST error → HTTP status, from the SQLSTATE the RPC raised. */
const STATUS: Record<string, 400 | 403 | 404 | 409> = {
  '42501': 403,
  '22023': 400,
  '22P02': 400,
  P0002: 404,
  '23505': 409,
  '23514': 409,
  '40001': 409,
};
export const rpcError = (c: Context<AppEnv>, e: { code?: string; message: string }) =>
  c.json({ error: e.message }, STATUS[e.code ?? ''] ?? 500);

/** A client that calls RPCs as the signed-in user, so auth.uid() and RLS apply. */
export const userDb = (c: Context<AppEnv>) =>
  createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: c.req.header('Authorization')! }, fetch: (...a) => fetch(...a) },
  });

export const URL_MINUTES = 15;

/** A signed link under this Worker: PUT one object (`use: 'put'`) or GET files under a prefix. */
export async function signedUrl(c: Context<AppEnv>, k: string, opts: { max?: number; get?: boolean }) {
  const exp = Math.floor(Date.now() / 1000) + URL_MINUTES * 60;
  const token = await signUpload(c.env.UPLOAD_SIGNING_KEY, {
    k,
    max: opts.max ?? 0,
    exp,
    ...(opts.get ? { use: 'get' as const } : {}),
  });
  return {
    url: `${new URL(c.req.url).origin}/v1/books/objects/${token}${opts.get ? '/' : ''}`,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}
