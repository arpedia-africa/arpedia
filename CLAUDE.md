# Arpedia

African subscription reading community: Android app (Expo), web admin console (Next.js), Supabase (Postgres + Auth), Cloudflare (Workers, Durable Objects, R2).

## Where things are
- **Specs:** `docs/prd/`. README (rules, data model, flow index), ARCHITECTURE, BUILD (how to build a flow), BUILD-PLAN (waves, ownership, gates), one file per flow `NN-*.md`, OPEN-QUESTIONS.
- **Design:** `DESIGN.md` (tokens, themes, motion, components), `PRODUCT.md` (users, voice, principles).
- **Prototypes (visual source of truth):** `prototype/` (app), `admin/` (admin). Read screens with the tool, never the source files:
  - `node tools/screen.mjs s-book s-unlock` prints app screens
  - `node tools/screen.mjs --admin books book-preview` prints admin screens
  - `node tools/screen.mjs --list 3` lists the screens in app flow 3
  - add `--css` for the matching styles
  - `node tools/shot.mjs --full s-book` saves a PNG reference to `.shots/` (themes: `--theme palm`)
- **Code** (created in flow 00):
  ```
  apps/mobile  apps/admin  packages/{ui,core,reader,convert}
  workers/{api,chat}  tools/desk  supabase/
  ```

## Rules that never bend
- **Screens are exact replicas of the prototype (owner's top requirement)**:
  - **Admin (web):** reuse the admin prototype's CSS file verbatim and render the same HTML structure and class names. Never restyle or use a component library.
  - **App (React Native):** every component mirrors a prototype element one to one (same name, sizes, colours, radii, spacing and type, from `--css`). Icons come only from the prototype sprite (`packages/ui/src/icons`). Never invent a component or icon.
  - **Owner review, not a pixel score (owner decision, 18 Nov):** the owner judges whether a screen is right. `node tools/parity.mjs` side-by-sides are a review aid: fix what is visibly different (layout, size, colour, spacing, copy, icons, missing or extra elements, wrapping), then move on. Never spend time chasing sub-pixel text position or anti-aliasing to lower a percentage. The owner reports anything wrong as a `fix` issue.
  - **Bar: very, very good, not perfectionist.** Before calling a screen done, look at the side-by-side like a demanding designer would and ask: would the owner be proud to show this? Check that it reads the same as the prototype at a glance (hierarchy, spacing rhythm, alignment, colour and type weight), that it looks good with real and long data (long names and titles, big numbers, empty lists), that all four themes have good contrast, that the empty, loading, error and offline states look designed rather than bare, that motion is smooth (no jank, no flash of unstyled content) and that touch feedback is there. Fix anything a person would notice. Ignore what only a pixel diff would notice.
  - layout, spacing, sizes, radii, type, copy, colours, icons, motion and every state.
  - Port values 1:1 from `node tools/screen.mjs <id> --css` (CSS px = dp).
  - Before a screen is done, capture the reference with `node tools/shot.mjs --full <id>` (and `--theme palm|plum|night`), capture the built screen on the emulator at the same width (375dp, the prototype's phone width), compare them side by side and fix every difference.
  - Allowed differences: real data, Android system UI, and changes the flow file states explicitly.
- **Small screens scale down, text never wraps:**
  - Design width is 375dp. On narrower phones (320–374dp) every size scales by `width ÷ 375` (minimum 0.85) through the `s()` helper in `packages/ui`: fonts, spacing, radii, icons. Never hard-code sizes without it.
  - At the default font size, single-line text (buttons, titles, labels, chips, tabs, stats, prices, list-row titles) must stay on one line from 320dp up. Use `numberOfLines={1}` with `adjustsFontSizeToFit` (min scale 0.85) as the safety net, and ellipsis only for user-generated text (names, book titles in rows).
  - If the reader turns on large text in Android settings, wrapping is allowed (accessibility comes first), but nothing may clip or overlap.
  - Check every screen at 320 and 375dp (owner decision, 21 Nov: 360 dropped to save device time).
- **Money:**
  - 1 credit = ₦3; book price = ceil(standard pages ÷ 2); standard page = 250 words.
  - Authors earn ₦1.60 per credit spent on their books.
  - Every credit movement is a row in the append-only `credit_ledger`, written only inside a Postgres function in one transaction. Never update balances directly.
- **Access:** RLS on every table. The client never writes money, entitlement or moderation fields. Staff writes go through RPCs that also write `audit_log`.
- **Books:**
  - Each chapter is encrypted with its own key.
  - Keys are released by a Worker only for entitled chapters.
  - Author uploads are untrusted: the verification Worker sanitises and recounts.
- **No Supabase Realtime, Edge Functions or Storage.** Server code runs on Cloudflare Workers; live chat runs on Durable Objects.
- **Design:**
  - Use `packages/ui` tokens and kit components; never hard-code colours (themes swap tokens).
  - No icons inside cards, list rows, callouts or empty states (Profile page excepted).
  - Every screen has empty, loading, error and offline states.
  - 44px touch targets; respect reduced motion.
- **Copy:** plain, friendly Nigerian English. State money before any tap that spends.

## How to work
- Build one flow at a time, following `docs/prd/BUILD.md`:
  1. migration and RLS first
  2. Workers
  3. app and admin screens
  4. only the tests listed there
  5. `/code-review`
- Stay inside the flow's ownership paths (`docs/prd/BUILD-PLAN.md#ownership`). In background worktrees, only add new files in `packages/ui` and `packages/core`.
- Read only what the flow needs: its flow file, plus the Data and Server sections of the flows it depends on.
- TypeScript strict. Database types come from `supabase gen types` (never hand-written). TanStack Query for server data; Zustand only for small UI state.
- If the prototype and the flow file disagree, the flow file wins.
- Unanswered questions: use the default in `docs/prd/OPEN-QUESTIONS.md` and note it in your report.
- **Checkpoint constantly.** After each step of a flow, commit, push, and update the PR description (Progress checklist, **Next step**, Notes). Another teammate's account may continue the work at any moment (`docs/prd/CLOUD-RUN.md`). Nothing may live only in a session.
- To continue someone else's work: read the open `flow-NN` PR's Progress, Next step and Notes and the last commits, then carry on from Next step.
- Keep reports short: what shipped, gate results, open items.

## Commands
Node 24, pnpm 12, Docker (for Supabase), JDK 17+ and the Android SDK (for the app).
- **Install:** `pnpm i`
- **Database:** `pnpm db:start` (local Supabase on ports 553xx: API 55321, DB 55322, Studio 55323) · `pnpm db:reset` (migrations + seed) · `pnpm db:test` (pgTAP) · `pnpm gen:types` (writes `packages/core/src/database.types.ts`; commit it)
- **Local env:** `pnpm dev:vars` writes `workers/*/.dev.vars`, `apps/admin/.env.local` and `apps/mobile/.env.local` from the running stack. Seed logins use password `arpedia-local` (ngozi@example.com reader, amaka@arpedia.africa Super admin, one staff per role).
- **Dev:** `pnpm dev` (admin on :3000 + api Worker on :8787 + chat Worker on :8788) · `pnpm dev:admin` · `pnpm dev:workers`
- **Fast screen loop (app):** `node tools/android-dev.mjs <serial>` once (prebuild + debug build + install **Arpedia Dev** `com.arpedia.reader.dev` beside the release app, and `adb reverse tcp:8081`) · `pnpm dev:mobile` (Metro; stop it before the run ends) · `node tools/android-dev.mjs <serial> --no-build --route /kit` (open a route on Metro) · edits reload in seconds · `node tools/parity.mjs --dev <ids>` while iterating
- **Release APK:** `node tools/android-release.mjs --arch arm64-v8a --serial c1212d5c` (kit on, as CI) · then the gate `node tools/parity.mjs <ids>`
- **Checks:** `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` (Vitest)
- **Smoke:** `node tools/smoke-api.mjs` (api health with a seeded JWT) · `node tools/smoke-admin.mjs` (staff gate)
- **E2E (Maestro):** `maestro test apps/mobile/.maestro/<flow>.yaml -e WIDTH=375` · all widths: `node tools/maestro-widths.mjs apps/mobile/.maestro/<flow>.yaml`
- **Parity:** `node tools/parity.mjs kit-a kit-b` (app gate: reference drawn in the dev build's WebView on the same phone, build from the release app; `--dev` builds from Metro; `--ref chrome` for a desktop-Chrome reference) · `node tools/parity.mjs --admin signin overview [--url http://127.0.0.1:3000]` · `node tools/shot.mjs …` (prototype) · `node tools/shot-url.mjs <url> <out.png> [w h] [--as email]` (built admin)
- **Icons:** `node tools/gen-icons.mjs` after a prototype sprite changes
- **Deploy:** Workers `pnpm --filter @arpedia/api deploy:staging` (and `@arpedia/chat`); admin on Vercel per PR; app: Actions → Release Android (fastlane `android internal`); production only from tagged releases
