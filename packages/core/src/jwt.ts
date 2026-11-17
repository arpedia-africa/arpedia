// Supabase access-token verification for Cloudflare Workers and Durable Objects.
// Import from '@arpedia/core/jwt' (kept off the main entry so the app bundle never pulls in jose).
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';

export interface SupabaseClaims extends JWTPayload {
  sub: string;
  role: string;
  email?: string;
  session_id?: string;
}

export interface VerifyOptions {
  /** Project URL, e.g. https://xyz.supabase.co. JWKS lives at /auth/v1/.well-known/jwks.json. */
  supabaseUrl: string;
  /** Legacy HS256 secret. Only the local Supabase CLI stack signs with it; staging and production use JWKS. */
  hsSecret?: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(supabaseUrl: string) {
  let set = jwksCache.get(supabaseUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl), {
      cacheMaxAge: 10 * 60 * 1000,
    });
    jwksCache.set(supabaseUrl, set);
  }
  return set;
}

export class AuthError extends Error {
  constructor(message = 'invalid token') {
    super(message);
    this.name = 'AuthError';
  }
}

/** Verify a Supabase access token and return its claims. Throws AuthError on any failure. */
export async function verifySupabaseJwt(token: string, opts: VerifyOptions): Promise<SupabaseClaims> {
  try {
    const issuer = new URL('/auth/v1', opts.supabaseUrl).toString();
    const { alg } = decodeProtectedHeader(token);
    const verifyOpts = { issuer, audience: 'authenticated' };
    const { payload } =
      alg === 'HS256'
        ? opts.hsSecret
          ? await jwtVerify(token, new TextEncoder().encode(opts.hsSecret), verifyOpts)
          : (() => {
              throw new AuthError('HS256 tokens are not accepted here');
            })()
        : await jwtVerify(token, jwks(opts.supabaseUrl), verifyOpts);
    if (typeof payload.sub !== 'string' || payload.role !== 'authenticated') throw new AuthError();
    return payload as SupabaseClaims;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(e instanceof Error ? e.message : 'invalid token');
  }
}

/** Pull the bearer token from an Authorization header. */
export function bearer(header: string | null | undefined): string | null {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}
