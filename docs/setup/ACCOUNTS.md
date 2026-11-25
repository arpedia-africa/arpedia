# Accounts: what exists, and what uses it

One list for the owner, the account set-up chat and the builders. **Look here before creating anything.** Names only: values live in the owner's `secrets.env`, never here. How each account is set up: [SETUP-GUIDE.md](SETUP-GUIDE.md).

## Who does what
| Who | Does |
|---|---|
| Owner | Payments, identity checks, legal acceptances, two-step codes, and the yes before any deploy |
| Account set-up chat ("Set up Arpedia online accounts") | Everything in web dashboards: accounts, projects, keys, DNS, webhooks. Saves values in `secrets.env` |
| Coding session | Code, config, secret names, copying secrets to GitHub and Cloudflare, staging deploys. Creates no accounts, projects, buckets, tokens or DNS records |
| Builders | Local only. They never read secrets or deploy |

## Exists already: reuse it
| Service | What | Saved as | Used by |
|---|---|---|---|
| Supabase | `arpedia-staging`, ref `wsblzfpiflefqpbsqkuy`, London, Free | `SUPABASE_STAGING_*` | `env.staging` in `workers/*/wrangler.jsonc` |
| Supabase | `arpedia-prod`, ref `lzrctrkuvkeftujqiqbn`, London, Free | `SUPABASE_PROD_*` | `env.production` in `workers/*/wrangler.jsonc` |
| Cloudflare | Workers Free, the account that also holds v25 | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (`arpedia-deploy`) | Worker deploys, preflight, backups |
| Cloudflare R2 | `arpedia-books-staging`, `arpedia-books-prod` | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (`arpedia-r2-2`, replaced `arpedia-r2` on 24 Nov) | api Worker `BOOKS`, staging sample content |
| Cloudflare R2 | `arpedia-media-staging`, `arpedia-media-prod` | same token | Nothing yet: no code uses them |
| Vercel | Hobby, owner-chosen account, not linked to GitHub. It already has an `arpedia` project, and DNS for `arpedia.africa` and `www` points at Vercel: leave both, use a new project for the admin console | `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | Admin console, deployed from CI with the token |
| Android signing | v25 upload key, Play service account | `ANDROID_*`, `PLAY_SERVICE_ACCOUNT_JSON` | `release-android.yml` |
| Firebase | `google-services.json` for `com.arpedia.reader` | `FIREBASE_GOOGLE_SERVICES_JSON` | App build |

**Staging is live (24 Nov 2026):** `https://arpedia-api-staging.arpedia-africa.workers.dev` and `https://arpedia-chat-staging.arpedia-africa.workers.dev` (workers.dev name `arpedia-africa`: don't rename, app builds use it). Database migrated, 6 sample books from `tools/launch/staging-content.mjs`. No admin console or Super admin yet. **Confirm email** is off on `arpedia-staging` only. The `STAGING_*` keys below are in `secrets.env`: never change `STAGING_BOOK_MASTER_KEY` or the books can't be opened.

**v25, never touch:** Supabase ref `qtsfpwmksiqtqjwthydz` (paused), R2 buckets `arpedia-books` and `arpedia-ota`, and any Worker, route or DNS record v25 uses.

## In progress or still needed
| Service | State (25 Nov 2026) | Saved as | Name in the Worker |
|---|---|---|---|
| Resend | `mail.arpedia.africa` verified, in the existing v25 account (`arpedia.africa` there: leave it). Key `supabase-smtp` is sending-only and limited to that domain. Custom SMTP saved on both Supabase projects; no real email sent yet. Still to do: a test email, DMARC, the webhook secret, and setting the Worker secret | `RESEND_API_KEY` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` |
| RevenueCat and Play products | Not started (reuse the v25 project) | `REVENUECAT_ANDROID_PUBLIC_KEY`, `REVENUECAT_SECRET_KEY` | `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_AUTH` |
| Google sign-in, FCM, Vision | Not started (reuse the v25 project) | `GOOGLE_OAUTH_*`, `FCM_SERVICE_ACCOUNT_JSON`, `GOOGLE_VISION_API_KEY` | Sign-in and push: set in Supabase and Expo |
| Expo push | Not started | `EXPO_ACCESS_TOKEN` | `EXPO_ACCESS_TOKEN`, `PUSH_MODE` |
| Flutterwave test keys, then the webhook | Not started | `FLW_TEST_*` | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` |
| Sentry | Organisation `arpedia`, US region (reported as the owner's choice). Projects `mobile`, `admin`, `workers`. Token `arpedia-ci` has only `org:ci`: it reads releases, but the crash-free check in `tools/launch/preflight.mjs` gets 403 on `stats_v2`, so that check needs its own read-only token. Not in any build yet; only the app reads a DSN today (nothing in admin or the Workers does) | `SENTRY_DSN_MOBILE`, `SENTRY_DSN_ADMIN`, `SENTRY_DSN_WORKERS`, `SENTRY_AUTH_TOKEN` | App variable `EXPO_PUBLIC_SENTRY_DSN` |
| PostHog | The account is US. **Owner to choose US or EU** before a key is made. The app defaults to the EU host, so US also needs `EXPO_PUBLIC_POSTHOG_HOST` | `POSTHOG_KEY` (not set) | App variables `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` |
| R2 `arpedia-backups` | Production only. Needs its own token: `arpedia-r2-2` doesn't cover it | `R2_*` in the GitHub `backup` environment | Backup workflow |
| Apple | Waits for the partner account | `ASC_*`, `APNS_*`, `APPLE_*` | iOS only |

Made by the coding session at deploy time, never reused between staging and production: `BOOK_MASTER_KEY`, `UPLOAD_SIGNING_KEY`, `PAYOUT_ACCOUNT_KEY`, `BACKUP_KEY`. Staging ones are saved as `STAGING_BOOK_MASTER_KEY`, `STAGING_UPLOAD_SIGNING_KEY` and `STAGING_PAYOUT_ACCOUNT_KEY`.

## Keeping it in step
1. Before creating anything, check this page. If it's listed as existing, reuse it.
2. After creating something, save the value in `secrets.env` under the name above and tell the coding session the name. The coding session updates this page.
3. New paid plan, or anything touching v25: stop and ask the owner.
