import type { SupabaseClaims } from '@arpedia/core/jwt';

export interface Env {
  APP_ENV: 'local' | 'staging' | 'production';
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Public (anon) key, for calling RPCs as the signed-in user. */
  SUPABASE_ANON_KEY: string;
  /** Base64 256-bit master key that wraps chapter keys (secret). */
  BOOK_MASTER_KEY: string;
  /** HMAC secret for signed upload URLs (secret). */
  UPLOAD_SIGNING_KEY: string;
  /** Local CLI stack only (HS256). Unset on staging and production, which verify with JWKS. */
  SUPABASE_JWT_SECRET?: string;
  BOOKS: R2Bucket;
}

export interface Vars {
  user: SupabaseClaims;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
