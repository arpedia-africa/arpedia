import type { SupabaseClaims } from '@arpedia/core/jwt';
import type { RateLimiter } from './ratelimit';

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
  /** Flow 12: Cloudflare Images, to cap book images at 1,600 px and make cover sizes. Unset → flags stay open, covers are served as uploaded. */
  IMAGES?: ImagesBinding;
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
  /** Flow 09: the website origin Flutterwave sends web checkouts back to (default https://arpedia.africa). */
  WEB_URL?: string;
  /** Flow 09: Flutterwave webhook `verif-hash` (secret). */
  FLUTTERWAVE_WEBHOOK_HASH?: string;
  /** Staging test build: "1" opens /v1/payments/test-store on staging (secret). Ignored on production. */
  TEST_STORE?: string;
  /** Flow 08: the chat Worker's ConversationDO (script arpedia-chat), to broadcast paid messages. */
  CONVERSATION?: DurableObjectNamespace;
  /** Flow 13: base64 256-bit key that encrypts author bank account numbers (secret). Local falls back to a fixed key. */
  PAYOUT_ACCOUNT_KEY?: string;
  /** Flow 15: PostHog project key (phc_…) for server events; unset → events are not sent. */
  POSTHOG_KEY?: string;
  /** Flow 15: PostHog host (default https://eu.i.posthog.com). */
  POSTHOG_HOST?: string;
  /** Flow 15 analytics-import: PostHog project number, for signups by source. */
  POSTHOG_PROJECT_ID?: string;
  /** Flow 15 analytics-import: PostHog personal API key with query read (secret); unset → not imported. */
  POSTHOG_PERSONAL_API_KEY?: string;
  /** Flow 15 analytics-import: PostHog app host for the query API (default from POSTHOG_HOST, else https://eu.posthog.com). */
  POSTHOG_API_HOST?: string;
  /** Flow 15 analytics-import: Play Console reports bucket (`pubsite_prod_rev_…`, or `pubsite_prod_…`). */
  PLAY_REPORTS_BUCKET?: string;
  /** Flow 15 analytics-import: Google service account JSON that may read Play reports (secret); unset → not imported. */
  PLAY_REPORTS_SERVICE_ACCOUNT?: string;
  /** Flow 15 analytics-import: Android package (default com.arpedia.reader). */
  PLAY_PACKAGE_NAME?: string;
  /** Flow 12: moderation-model key for the content-policy check (secret); unset → the check is skipped. */
  MODERATION_API_KEY?: string;
  /** Flow 12: moderation endpoint (default https://api.openai.com/v1/moderations). */
  MODERATION_API_URL?: string;
  /** Flow 04: rate limit on /keys and /download, per reader and device (wrangler `ratelimits`). */
  KEYS_LIMIT?: RateLimiter;
}

export interface Vars {
  user: SupabaseClaims;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
