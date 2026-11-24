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
| Cloudflare R2 | `arpedia-books-staging`, `arpedia-books-prod` | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (`arpedia-r2`) | api Worker `BOOKS` |
| Cloudflare R2 | `arpedia-media-staging`, `arpedia-media-prod` | same token | Nothing yet: no code uses them |
| Vercel | Hobby, owner-chosen account, not linked to GitHub. It already has an `arpedia` project, and DNS for `arpedia.africa` and `www` points at Vercel: leave both, use a new project for the admin console | `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | Admin console, deployed from CI with the token |
| Android signing | v25 upload key, Play service account | `ANDROID_*`, `PLAY_SERVICE_ACCOUNT_JSON` | `release-android.yml` |
| Firebase | `google-services.json` for `com.arpedia.reader` | `FIREBASE_GOOGLE_SERVICES_JSON` | App build |

**On hold:** don't copy `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` anywhere until the owner decides whether to replace the `arpedia-r2` token.

**v25, never touch:** Supabase ref `qtsfpwmksiqtqjwthydz` (paused), R2 buckets `arpedia-books` and `arpedia-ota`, and any Worker, route or DNS record v25 uses.

## In progress or still needed
| Service | State (24 Nov 2026) | Saved as | Name in the Worker |
|---|---|---|---|
| Resend | In progress, in the existing v25 account. `arpedia.africa` there is already verified (leave it). `mail.arpedia.africa` added with its DNS records; still to do: verify, save the key, Supabase SMTP, DMARC | `RESEND_API_KEY` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` |
| RevenueCat and Play products | Not started (reuse the v25 project) | `REVENUECAT_ANDROID_PUBLIC_KEY`, `REVENUECAT_SECRET_KEY` | `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_AUTH` |
| Google sign-in, FCM, Vision | Not started (reuse the v25 project) | `GOOGLE_OAUTH_*`, `FCM_SERVICE_ACCOUNT_JSON`, `GOOGLE_VISION_API_KEY` | Sign-in and push: set in Supabase and Expo |
| Expo push | Not started | `EXPO_ACCESS_TOKEN` | `EXPO_ACCESS_TOKEN`, `PUSH_MODE` |
| Flutterwave test keys, then the webhook | Not started | `FLW_TEST_*` | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` |
| Sentry, PostHog | Not started | `SENTRY_*`, `POSTHOG_KEY` | App variables `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY` |
| R2 `arpedia-backups` | Production only. Needs its own token: `arpedia-r2` doesn't cover it | `R2_*` in the GitHub `backup` environment | Backup workflow |
| Apple | Waits for the partner account | `ASC_*`, `APNS_*`, `APPLE_*` | iOS only |

Made by the coding session at deploy time, never reused between staging and production: `BOOK_MASTER_KEY`, `UPLOAD_SIGNING_KEY`, `PAYOUT_ACCOUNT_KEY`, `BACKUP_KEY`.

## Keeping it in step
1. Before creating anything, check this page. If it's listed as existing, reuse it.
2. After creating something, save the value in `secrets.env` under the name above and tell the coding session the name. The coding session updates this page.
3. New paid plan, or anything touching v25: stop and ask the owner.
