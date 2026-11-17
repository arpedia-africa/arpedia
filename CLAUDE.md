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
- **Screens match the prototype exactly**:
  - layout, spacing, sizes, radii, type, copy, colours, icons, motion and every state.
  - Port values 1:1 from `node tools/screen.mjs <id> --css` (CSS px = dp).
  - Before a screen is done, capture the reference with `node tools/shot.mjs --full <id>` (and `--theme palm|plum|night`), capture the built screen on the emulator at the same width (375dp, the prototype's phone width), compare them side by side and fix every difference.
  - Allowed differences: real data, Android system UI, and changes the flow file states explicitly.
- **Small screens scale down, text never wraps:**
  - Design width is 375dp. On narrower phones (320–374dp) every size scales by `width ÷ 375` (minimum 0.85) through the `s()` helper in `packages/ui`: fonts, spacing, radii, icons. Never hard-code sizes without it.
  - At the default font size, single-line text (buttons, titles, labels, chips, tabs, stats, prices, list-row titles) must stay on one line from 320dp up. Use `numberOfLines={1}` with `adjustsFontSizeToFit` (min scale 0.85) as the safety net, and ellipsis only for user-generated text (names, book titles in rows).
  - If the reader turns on large text in Android settings, wrapping is allowed (accessibility comes first), but nothing may clip or overlap.
  - Check every screen at 320, 360 and 375dp.
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
Filled in by flow 00: install, dev (mobile, admin, workers), test (vitest, pgTAP), e2e (Maestro), db reset, generate types, deploy.
