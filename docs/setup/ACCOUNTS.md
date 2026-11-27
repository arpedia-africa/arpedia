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
| Service | State (27 Nov 2026) | Saved as | Name in the Worker |
|---|---|---|---|
| Resend | `mail.arpedia.africa` verified, in the existing v25 account (`arpedia.africa` there: leave it). Key `supabase-smtp` is sending-only and limited to that domain. Custom SMTP saved on both Supabase projects; no real email sent yet. Still to do: a test email, DMARC, the webhook secret, and setting the Worker secret | `RESEND_API_KEY` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` |
| RevenueCat | v25 project kept (old subscribers stay). New iOS app `Arpedia iOS (new)`, bundle `africa.arpedia.reader`, IAP key uploaded. Keys saved and in GitHub. Still to do: Play and App Store products, the webhook, and Apple's credential warning (clears when the Paid Apps Agreement is active) | `REVENUECAT_ANDROID_PUBLIC_KEY`, `REVENUECAT_IOS_PUBLIC_KEY`, `REVENUECAT_SECRET_KEY` | `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_AUTH` |
| Google Play | Developer account **AvraTech**. Service account permissions checked, internal testers set. GitHub `release` environment not configured yet | `PLAY_SERVICE_ACCOUNT_JSON` | `release-android.yml` |
| Google sign-in | On in Supabase staging and production, web client `supabase-auth` in the v25 Google project `arpedia-71bd8`. Android OAuth clients made for the Play signing key and the upload key. Sign-in app still in Testing: only test users can sign in until it is published | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Set in Supabase Auth, not in a Worker |
| FCM (push) | Service account file saved, from the v25 project | `FCM_SERVICE_ACCOUNT_JSON` | Uploaded to Expo for Android push |
| Google Vision | Skipped: needs paid billing. No code uses it today | `GOOGLE_VISION_API_KEY` (not set) | none |
| Expo push | Not started | `EXPO_ACCESS_TOKEN` | `EXPO_ACCESS_TOKEN`, `PUSH_MODE` |
| Flutterwave | Existing account **ARPEDIA GLOBAL LIMITED**. V3 test keys saved and in GitHub. Still to do: the webhook and live approval | `FLW_TEST_PUBLIC_KEY`, `FLW_TEST_SECRET_KEY`, `FLW_TEST_ENCRYPTION_KEY` | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` |
| Sentry | Organisation `arpedia`, US region (reported as the owner's choice). Projects `mobile`, `admin`, `workers`. Token `arpedia-ci` has only `org:ci`: it reads releases, but the crash-free check in `tools/launch/preflight.mjs` gets 403 on `stats_v2`, so that check needs its own read-only token. Not in any build yet; only the app reads a DSN today (nothing in admin or the Workers does) | `SENTRY_DSN_MOBILE`, `SENTRY_DSN_ADMIN`, `SENTRY_DSN_WORKERS`, `SENTRY_AUTH_TOKEN` | App variable `EXPO_PUBLIC_SENTRY_DSN` |
| PostHog | US project, **provisional: the owner has not chosen US or EU, so do not deploy with it yet.** The key only works on the US host. The app defaults to the EU host, so US also needs `EXPO_PUBLIC_POSTHOG_HOST` | `POSTHOG_KEY`, `POSTHOG_HOST` (both US) | App variables `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` |
| R2 `arpedia-backups` | **Done (27 Nov).** Private bucket, its own token limited to it, backup key made. A real production dump was encrypted and uploaded, and the under-26-hours check passed | `R2_*`, `BACKUP_KEY` and the production database URL, in the GitHub `backup` environment | Backup workflow |
| Apple | Team **Arpedia Africa (Ahuva Limited)**, Team ID in secrets; arpedia.africa@gmail.com is Admin. App ID `africa.arpedia.reader` (IAP, push, Sign in with Apple, Associated Domains), App Store Connect app, Services ID, ASC, APNs, Sign in with Apple and IAP keys saved. iOS app in Firebase, APNs uploaded. Tax forms active. **Blocker:** Ahuva Limited must add its bank account so the Paid Apps Agreement goes from Pending User Info to Active. No iOS build workflow yet | `ASC_*`, `APNS_*`, `APPLE_*`, `FIREBASE_IOS_PLIST`, `MATCH_PASSWORD` | iOS only |

Made by the coding session at deploy time, never reused between staging and production: `BOOK_MASTER_KEY`, `UPLOAD_SIGNING_KEY`, `PAYOUT_ACCOUNT_KEY`, `BACKUP_KEY`. Staging ones are saved as `STAGING_BOOK_MASTER_KEY`, `STAGING_UPLOAD_SIGNING_KEY` and `STAGING_PAYOUT_ACCOUNT_KEY`.

**GitHub secrets (27 Nov):** 43 repository secrets set from `secrets.env` by `tools/sync-secrets.mjs`, plus the `backup` environment. Only Google Vision is left out on purpose.

## Keeping it in step
1. Before creating anything, check this page. If it's listed as existing, reuse it.
2. After creating something, save the value in `secrets.env` under the name above and tell the coding session the name. The coding session updates this page.
3. New paid plan, or anything touching v25: stop and ask the owner.
