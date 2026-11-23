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
  /** This Worker's public origin, for URLs saved in the database (avatars). Defaults to the request origin. */
  PUBLIC_API_URL?: string;
  /** Admin console origin, for invite links (default http://localhost:3000). */
  ADMIN_URL?: string;
  /** Sends staff invite emails; unset locally (the link is logged instead). */
  RESEND_API_KEY?: string;
  /** The chat Worker's ConversationDO (flow 06), for room progress events (flow 07). */
  CHAT_ROOMS?: DurableObjectNamespace;
  /** Resend webhook signing secret (whsec_…): inbound email (flow 14), opens and bounces (flow 15); unset locally. */
  RESEND_WEBHOOK_SECRET?: string;
  /** Expo push access token (secret), when push security is on for the Expo project. */
  EXPO_ACCESS_TOKEN?: string;
  /** `mock` logs pushes instead of sending them (default locally); `expo` sends through Expo. */
  PUSH_MODE?: 'mock' | 'expo';
  /** Flow 09: shared Authorization header RevenueCat sends on webhooks (secret). Unset → 503. */
  REVENUECAT_WEBHOOK_AUTH?: string;
  /** Flow 09: RevenueCat secret API key, for promotional days (secret). */
  REVENUECAT_API_KEY?: string;
  /** Flow 09: RevenueCat entitlement id (default "premium"). */
  REVENUECAT_ENTITLEMENT?: string;
  /** Flow 09: Flutterwave secret key, for verify, refund and subscription calls (secret). */
  FLUTTERWAVE_SECRET_KEY?: string;
  /** Flow 09: Flutterwave webhook `verif-hash` (secret). */
  FLUTTERWAVE_WEBHOOK_HASH?: string;
}

export interface Vars {
  user: SupabaseClaims;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
