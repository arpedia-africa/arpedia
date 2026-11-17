# Arpedia PRD

Flow-based product spec for the Arpedia rebuild. We build the platform **one flow at a time**. Each flow file is the full contract for that slice: screens, rules, data, server, admin side and "done when".

- How we build: [BUILD.md](BUILD.md) · Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Template for a flow: [_template.md](_template.md) · Open questions: [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)
- Product and brand: [../../PRODUCT.md](../../PRODUCT.md) · Design system: [../../DESIGN.md](../../DESIGN.md)
- Visual source of truth: app prototype `prototype/` (https://claude.ai/artifact/Aiad4WFCZ24uvxAGipc7CN) and admin prototype `admin/` (https://claude.ai/artifact/UMoCcZzRri7x8h3rvW9nB9). Screen ids in the flow files (`s-book`, `book-access`) match the prototype.

## Product in one paragraph
A subscription reading community for African readers on real Android phones. Members subscribe, get credits on every renewal, read a free 10% preview of any book, and unlock books with credits, all at once or chapter by chapter. Every book has a community around it: highlights, discussion, clubs, reading rooms, and direct contact with the author. Authors self-publish through Author Studio and earn a fixed amount for every credit spent on their books. Staff run the platform from a web admin console.

## Platform decisions
| Area | Decision |
|---|---|
| Mobile app | Expo SDK (React Native, TypeScript), Expo Router, built and released with fastlane (no EAS). **Android:** an update to the v25 Play app `com.arpedia.reader`. **iOS:** a **new app** `africa.arpedia.reader` under a partner's Apple Developer account that gives arpedia.africa@gmail.com access. One RevenueCat project (v25's) for both. Android first; iOS once the Apple account is approved |
| Reader | foliate-js (MIT) in a WebView as a local bundle. Never fork Readest (AGPL) |
| Admin console | Next.js (App Router) on Vercel, staff only |
| Data and sign-in | Supabase (London): Postgres with Row Level Security on every table, money and access logic in SQL functions, pg_cron, pgmq queues, Auth. No Supabase Realtime, Edge Functions or Storage |
| Server code | Cloudflare Workers: webhooks, signed URLs, chapter key release, book verification, push, email, image checks |
| Chat, groups, reading rooms | Cloudflare Durable Objects (WebSocket Hibernation); Postgres keeps the message history |
| Files | Cloudflare R2 with signed URLs. Each chapter encrypted with its own key; the app only receives keys for chapters the reader is entitled to |
| Book conversion | Local first: DOCX/EPUB converted on the author's phone, verified and encrypted by a Worker; PDFs and problem files handled by a staff desk CLI (pandoc, epubcheck) on our computers. See [12-book-pipeline.md](12-book-pipeline.md) |
| In-app payments | Google Play Billing through RevenueCat (subscriptions and credit top-ups) |
| Web payments | Flutterwave (web checkout, author payouts by bank transfer) |
| Push | FCM, sent from Workers |
| Errors and analytics | Sentry, PostHog |

## Rules that apply to every flow
**Money and credits**
- 1 credit = ₦3. Book price = ceil(standard pages ÷ 2) credits. Standard page = 250 words; a full-page image counts as 1 page. Price is computed at processing time and stored on the book revision.
- Readers pay upfront (**Unlock all**) or **Pay as you read**: a chapter's credits are taken when the reader moves past that chapter's first page. The total never exceeds the upfront price. **Pay the rest** is available at any time. Re-reading is free. Undo within 10 minutes. Auto-unlock next chapter is on by default.
- Free preview: the first 10% of every book.
- Chapters over about 20 pages, or books without chapters, are split into parts at processing time. Chapter charges are spread so they add up exactly to the book price.
- Plans: Monthly ₦900 = 300 credits, Quarterly ₦2,400 = 800 credits, Yearly ₦8,400 = 3,000 credits (200 bonus). Web prices are slightly lower. Credits refill on renewal.
- Top-ups for subscribers only, at ₦3 a credit: 200 for ₦600, 500 for ₦1,500, 1,000 for ₦3,000.
- Unused plan credits roll over one period, capped at one plan's worth. On cancel, rolled-over credits expire at period end. Pause for 1–3 months is offered before cancel. Unlocked books stay in the library forever.
- Authors earn a fixed **₦1.60 per credit** spent on their book (unlocks, chapters, tips, author messages), paid monthly. Undone chapter charges are not paid.
- Every credit movement is an append-only row in the **credit ledger**. Balances are derived from the ledger, never edited directly. All spending happens in a single Postgres function (RPC) inside one transaction.

**Experience**
- Built for 360px Android, slow networks, offline, large text (WCAG 2.2 AA, 44px touch targets).
- App colour themes (Sunflower, Palm, Plum, Night) swap tokens only; no hard-coded colours on the main colour. See DESIGN.md.
- Motion tokens from DESIGN.md; respect reduced motion.
- Every state is designed: empty, loading (skeleton), error, offline, first run.
- No icons inside cards, list rows, callouts or empty states (Profile page is the only exception).
- Copy is plain, friendly Nigerian English. Money is always stated before a tap that spends.

**Security and privacy**
- RLS on every table; the client never writes money or moderation fields.
- Book files: signed URLs, short expiry, encrypted on device, preview builds contain only the preview.
- Personal data minimised; users can export and delete their account.

## Core data model (shared by all flows)
Each flow file lists the tables it adds or changes. The shared core:

| Table | Purpose |
|---|---|
| `profiles` | One row per user: name, username, avatar, role flags (reader, author, staff), theme, interests |
| `books` | Book identity, author, genre, status |
| `book_revisions` | Each submitted version: files, manifest (chapters, parts, page counts), price in credits, review state. Readers get the approved revision |
| `chapters` | Per revision: order, title, standard pages, credit price |
| `subscriptions` | Plan, store (play/web), status, period start and end, pause state |
| `credit_ledger` | Append-only: user, delta, reason (plan_grant, rollover, top_up, unlock_all, chapter, undo, tip, message, expiry, refund, staff_adjust), book or chapter, author earning amount |
| `entitlements` | What a reader can open: whole book or specific chapters |
| `reading_progress` | Position (CFI), percent, last opened, device |
| `annotations` | Highlights, notes, bookmarks with CFI ranges |
| `groups`, `group_members`, `messages` | Community, clubs, reading rooms, direct messages |
| `author_earnings`, `payout_runs`, `payouts` | Monthly earnings and bank transfers |
| `reports`, `moderation_actions` | Trust and safety |
| `audit_log` | Every staff action |

## Flows and build order
The wave-by-wave plan with parallel background agents, ownership rules and gates is in [BUILD-PLAN.md](BUILD-PLAN.md). It adds flow **00 Foundation** ([00-foundation.md](00-foundation.md)) first and **17 Migration and launch** last, and builds 06 Community before 08 Authors. The table below lists the product flows.

Each flow ships with its admin side. Status: ⬜ not started · 🟨 in progress · ✅ done.

| Build order | Flow | File | App screens | Admin side | Status |
|---|---|---|---|---|---|
| 1 | Sign-in and onboarding | [01-sign-in-onboarding.md](01-sign-in-onboarding.md) | 9 | Staff sign-in, roles | ⬜ |
| 2 | Discovery | [02-discovery.md](02-discovery.md) | 10 | Curation, search tuning | ⬜ |
| 3 | Book pipeline and catalogue (staff + author upload) | [12-book-pipeline.md](12-book-pipeline.md) | — | Books queue, Quick review, publish | ⬜ |
| 4 | Book page, preview and unlock | [03-book-page-unlock.md](03-book-page-unlock.md) | 13 | Book access and pricing | ⬜ |
| 5 | Reading | [04-reading.md](04-reading.md) | 17 | Content reports | ⬜ |
| 6 | Credits and plans | [09-credits-plans.md](09-credits-plans.md) | 6 | Pricing rules, plans, refunds, revenue | ⬜ |
| 7 | Library | [05-library.md](05-library.md) | 7 | — | ⬜ |
| 8 | Author Studio | [11-author-studio.md](11-author-studio.md) | 19 | Author applications | ⬜ |
| 9 | Author earnings and payouts | [13-earnings-payouts.md](13-earnings-payouts.md) | — | Earnings cycles, payout runs | ⬜ |
| 10 | Profile and settings | [10-profile-settings.md](10-profile-settings.md) | 10 | Reader accounts | ⬜ |
| 11 | Authors (follow, profile, message) | [08-authors.md](08-authors.md) | 5 | Author accounts | ⬜ |
| 12 | Community | [06-community.md](06-community.md) | 8 | Groups, channels | ⬜ |
| 13 | Reading rooms | [07-reading-rooms.md](07-reading-rooms.md) | 4 | — | ⬜ |
| 14 | Trust, safety and support | [14-trust-support.md](14-trust-support.md) | — | Reports, moderation, tickets | ⬜ |
| 15 | Engage and insights | [15-engage-insights.md](15-engage-insights.md) | — | Campaigns, notifications, analytics | ⬜ |
| 16 | Admin access and settings | [16-admin-settings.md](16-admin-settings.md) | — | Staff, roles, config, audit | ⬜ |

Why this order: sign-in and catalogue first so there are users and books; the reader and money next because they carry the most risk; community last because it is broad but low risk. Admin access (16) is built in thin form with flow 1 and completed at the end.

## Open decisions
Assumptions in use until answered:
1. **Platforms:** decided.
   - **Android:** keeps the v25 Play app (`com.arpedia.reader`).
   - **iOS:** a new app `africa.arpedia.reader` under a partner's Apple Developer account (we're invited as Admin; the seller name is theirs). iOS needs Sign in with Apple (App Store rule 4.8).
   - **v25 iOS subscribers** keep access through RevenueCat until their old subscription ends, then subscribe in the new app.
2. **v25 data:** decided. New Supabase project, one-off migration of users (logins kept), books, highlights, progress and subscriptions. See ARCHITECTURE.md.
3. **Team size and launch date:** unknown. Flow files are sized so one developer with Claude can finish a flow in about 1–2 weeks.
4. **Google Play policy for credits:** confirm consumable top-ups and subscription credits comply before flow 6.
