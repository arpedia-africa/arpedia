# Arpedia architecture

Decided 16 Nov 2026. Two platforms only: **Supabase** for data and sign-in, **Cloudflare** for everything that runs code, stores files or holds live connections. No containers, no extra servers.

```
     Android app (Expo)                       Admin console (Next.js)
 ┌─────────────────────────────────┐        ┌──────────────────────────┐
 │ Screens · TanStack Query        │        │ Staff screens, 2FA       │
 │ SQLite: progress, notes, outbox │        │ Vercel                   │
 │ Reader WebView (foliate-js)     │        └─────────────┬────────────┘
 │ Book converter (Author Studio)  │                      │
 │ Encrypted chapters on device    │                      │
 └──────┬─────────────────┬────────┘                      │
        │ HTTPS           │ WebSocket                     │
 ┌──────▼─────────────────▼───────────────────────────────▼────────┐
 │ Cloudflare                                                      │
 │  Workers: API edge — webhooks, signed URLs, book verification,  │
 │           chapter keys, push, image checks, email               │
 │  Durable Objects: one per chat, group, DM thread, reading room  │
 │  R2: book files (encrypted per chapter), covers, avatars        │
 └──────┬──────────────────────────────────────────────────────────┘
        │ Postgres (service role from Workers; user JWT from apps)
 ┌──────▼──────────────────────────────────────────────────────────┐
 │ Supabase (London)                                               │
 │  Postgres: RLS on every table · money and access in SQL         │
 │   functions · credit ledger · full-text search · pg_cron        │
 │   · pgmq queues                                                 │
 │  Auth: email + password, Google                                 │
 └─────────────────────────────────────────────────────────────────┘
 RevenueCat (Google Play) · Flutterwave (web pay, payouts)
 FCM push · Sentry · PostHog
 Staff desk CLI on our computers: pandoc + epubcheck for PDFs and
   problem files
```

## Decisions

### 1. Business logic: Supabase Postgres + Cloudflare Workers
- **Postgres functions (RPC)** hold every rule that touches money, entitlements or permissions: spending credits, unlocking chapters, undo, rollover, expiry, earnings, moderation actions. Each runs in one transaction behind RLS. The apps call them directly with the user's JWT.
- **Cloudflare Workers** run all server-side TypeScript:
  - RevenueCat and Flutterwave webhooks (verify signature, call ledger RPC with the service key, idempotent by event id)
  - signed R2 URLs and chapter key release
  - book verification after upload
  - push notifications (FCM), email, image moderation
  - the admin's privileged actions that call third parties
- **Not used:** Supabase Edge Functions, Supabase Realtime, Supabase Storage.

### 2. Chat, groups and reading rooms: Cloudflare Durable Objects (not Supabase Realtime)
- One Durable Object per conversation (group, club, DM thread, reading room) using the **WebSocket Hibernation API**, so idle connections cost almost nothing.
- **Connect:** the app opens a WebSocket with its Supabase JWT. The Durable Object verifies the token (Supabase JWKS) and checks membership (cached, refreshed from Postgres).
- **Send:** the Durable Object broadcasts the message, typing and presence to everyone connected, then writes messages to Postgres in small batches, idempotent by client message id.
- **Postgres `messages` is the source of truth** for history, search, reports and moderation. The app loads history over HTTPS and only uses the socket for live updates.
- **Offline members** get an FCM push sent by a Worker.
- **Moderation** (delete, mute, ban) is written to Postgres first, then pushed to the Durable Object so it applies live.
- **Cost:** Workers Paid plan ($5 a month) covers early scale. Durable Object requests and WebSocket messages are billed in fractions of a dollar per million, and hibernated sockets are not billed for idle time. Check Cloudflare's current pricing before launch.

### 3. Book protection: per-chapter keys
- At publish, the verification Worker encrypts **each chapter (part) separately** with its own AES-GCM key. Keys are stored server-side, encrypted with a master key held in Workers secrets.
- **The app receives keys only for chapters the reader is entitled to:**
  - preview chapters: free to everyone
  - Unlock all: every key
  - Pay as you read: one key per unlocked chapter
- Keys are wrapped with a per-device key and kept in the phone's secure storage. Chapter files can sit on the device. Without a key they are unreadable, so a downloaded book cannot be extracted past what was paid for.
- **Offline:** unlocked chapters read offline. The next chapter for a pay-as-you-read reader needs a connection, or a pre-unlock while online.
- Device limit and key revocation (refund, account deletion) are handled by the key-release Worker.

### 4. Book conversion: local first
No cloud container. The work happens on the author's phone and on our own computers, and the cloud only verifies.

1. **On the author's phone (Author Studio):**
   - **DOCX:** converted in JavaScript (mammoth.js), producing clean HTML.
   - **EPUB:** parsed with the same foliate-js code the reader uses.
   - The app detects chapters, counts words, shows the author their chapters and a preview, and builds a normalised EPUB3 plus a manifest. The author confirms, then the app uploads to R2 with a signed URL.
2. **On Cloudflare (verification Worker), always:**
   - Treat the upload as untrusted. Sanitise all HTML: no scripts, event handlers, external links or remote resources.
   - Recount words, then compute standard pages, price and parts (split above about 20 pages). Cut the 10% preview, check cover size, then encrypt each chapter and write the artefacts to R2.
   - **The Worker's numbers are the real ones.** Counts from the phone are only hints.
   - Readiness score, then route to **Quick review** or **Needs fixes**.
3. **On our computers (staff desk CLI):**
   - Handles **PDFs and anything the phone could not convert.**
   - A small command-line tool pulls those jobs from the `book_desk` queue, converts with pandoc, runs epubcheck, lets staff fix issues in the admin formatter, then uploads through the same verification Worker.
   - It works whenever a staff computer is on. Authors see "With the Arpedia team" while it waits.

Why: no server to run or pay for, and fast feedback for authors on their own phone. The one piece that must be trusted, verification, stays on our side. Full pipeline rules: [12-book-pipeline.md](12-book-pipeline.md).

### 5. Data home: new Supabase project
- **New Supabase project in London (eu-west-2)** with the new schema. Nothing legacy is carried over.
- **Nothing is migrated from v25** (owner, 23 Nov 2026). Readers create new accounts and books are added through the pipeline.

## Rest of the stack
| Layer | Choice |
|---|---|
| App | Expo + Expo Router, TypeScript strict, TanStack Query, small Zustand store, expo-sqlite for offline data and the sync outbox, expo-secure-store for keys |
| Reader | foliate-js local bundle in react-native-webview; typed bridge messages; positions as EPUB CFI |
| Admin | Next.js on Vercel (preview deploy per PR; Pro plan needed for commercial use); staff role and 2FA; every privileged write through an RPC that also writes the audit log |
| Search | Postgres full-text + pg_trgm |
| Jobs | pg_cron for renewals, rollover, expiry, earnings close; pgmq queues `book_verify` and `book_desk` |
| Payments | RevenueCat for Google Play subscriptions and top-ups; Flutterwave for web checkout and author payouts |
| Push | FCM, sent from Workers |
| Images | Covers and avatars in R2; uploads checked by an image-moderation Worker (Google SafeSearch), with borderline images sent to the Reports queue |
| Errors, analytics, flags | Sentry, PostHog |
| CI/CD | GitHub Actions: typecheck, lint, tests. fastlane for app builds and store uploads (Play internal track, TestFlight); Wrangler for Workers; Supabase CLI for migrations |

## Repo layout
```
apps/mobile        Expo app (includes Author Studio converter)
apps/admin         Next.js admin console
packages/reader    foliate-js reader bundle + bridge
packages/convert   DOCX/EPUB → normalised EPUB3 + manifest (runs on phone and in the CLI)
packages/core      shared types, pricing, page counting, chapter splitting (zod)
packages/ui        design tokens: themes, motion
workers/api        Cloudflare Worker: webhooks, signed URLs, keys, verification, push
workers/chat       Durable Objects for conversations and rooms
tools/desk         staff desk CLI (pandoc, epubcheck)
supabase/          migrations, seed, SQL functions, pgTAP tests
```
`packages/convert` and `packages/core` are shared, so the phone, the CLI and the verification Worker count pages and price books with **the same code**.

## Monthly running cost at launch (estimate)
| Service | Cost |
|---|---|
| Supabase Pro | $25 |
| Vercel Pro (admin console) | $20 |
| Cloudflare Workers Paid (Workers, Durable Objects, R2 storage) | $5 + usage, a few dollars early on |
| RevenueCat | Free under $2.5k monthly tracked revenue, then 1% |
| Sentry, PostHog | Free tiers |
| **Total** | **about $55–70 a month** before real scale |

## Risks to watch
- **Phone conversion on low-end devices:** large DOCX files may be slow. Cap the in-app converter (for example 300,000 words), and send anything bigger to the staff desk.
- **Staff desk depends on a computer being on.** Show honest wait times to authors. If PDF volume grows, the same CLI can move to a small cloud machine without code changes.
- **Durable Objects and Postgres disagree:** the batched write must retry and stay idempotent, and history always loads from Postgres.
- **Key release is a single point of failure for reading new chapters.** Cache keys on the device; the Worker runs at the edge with no cold start.
