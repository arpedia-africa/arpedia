import type { SupabaseClaims } from '@arpedia/core/jwt';

export interface Env {
  APP_ENV: 'local' | 'staging' | 'production';
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Local CLI stack only (HS256). Unset on staging and production, which verify with JWKS. */
  SUPABASE_JWT_SECRET?: string;
  BOOKS: R2Bucket;
  /** This Worker's public origin, for URLs saved in the database (avatars). Defaults to the request origin. */
  PUBLIC_API_URL?: string;
  /** Admin console origin, for invite links (default http://localhost:3000). */
  ADMIN_URL?: string;
  /** Sends staff invite emails; unset locally (the link is logged instead). */
  RESEND_API_KEY?: string;
}

export interface Vars {
  user: SupabaseClaims;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
