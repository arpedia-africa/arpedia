# How we build Arpedia

Lean, flow by flow, production quality. No ceremony that doesn't make the app better.

## The loop (one flow at a time)
1. **Read the flow file.** Answer its open questions before writing code. If the prototype and the flow file disagree, the flow file wins; fix the prototype later.
2. **Data first.** Write the migration (tables, indexes, RLS policies, RPC functions), seed data, then generate types (`supabase gen types`). The schema is the contract between app, admin and server.
3. **Build the vertical slice.** Server functions, app screens and admin screens for the flow, together, against real local data. No mock layers beyond seed data.
4. **Test what can hurt.** See below. Nothing else.
4b. **Match the prototype; the owner judges it.** Admin reuses the prototype CSS and markup verbatim. App components mirror prototype elements one to one. Put the reference (`node tools/shot.mjs --full <id>`) and the build side by side (`node tools/parity.mjs`, 4 themes) and fix every *visible* difference in layout, size, type, colour, copy, icons and state. Check 320dp and 360dp: nothing that should be one line wraps. The percentage is a guide, not a gate: never chase 1–2 device-pixel text offsets or anti-aliasing. Post the side-by-side images in the PR for the owner.
5. **Check on a real phone.** Low-end Android (2–3 GB RAM), slow network, large text, offline, all four themes, reduced motion.
6. **Review.** Run `/code-review` on the diff. Fix real findings only.
7. **Ship.** Merge to main, release to the internal Play track behind the flow's feature flag. Tick the flow in [README.md](README.md).

A flow is **done** when every item in its "Done when" list is true on a real device against staging.

## Testing: only where it pays
| Test | Where | Why |
|---|---|---|
| SQL tests (pgTAP) | Every RPC that moves credits, money or entitlements; every RLS policy on sensitive tables | Money and access bugs are the expensive ones |
| Unit tests (Vitest) | Pure logic: pricing, page counting, chapter splitting, CFI mapping, date and rollover rules | Cheap, fast, catches maths mistakes |
| One E2E happy path per flow (Maestro) | The flow's main path on Android | Proves the slice works end to end |
| Webhook replay tests | RevenueCat, Flutterwave | Payments arrive twice, late or out of order |

We do **not** write: snapshot tests, tests for UI layout, tests that mock Supabase, coverage targets, or tests for code that only passes data through.

## Stack and conventions
- **Repo:** one pnpm workspace.
  ```
  apps/mobile        Expo app (Expo Router)
  apps/admin         Next.js admin console
  packages/reader    foliate-js reader bundle + bridge to the app
  packages/ui        design tokens (themes, motion) shared by app and admin
  packages/core      shared types, pricing and ledger logic, validation (zod)
  supabase/          migrations, seed, RPC functions, edge functions, tests
  workers/ingest     book conversion container
  ```
- **TypeScript strict** everywhere. Types for the database come from `supabase gen types`, never hand-written.
- **App state:** TanStack Query for server data; a small Zustand store only for UI state (theme, reader settings). No Redux.
- **Server logic** lives in Postgres functions when it touches money, entitlements or permissions (one transaction, enforced by RLS). Edge Functions only for webhooks, third-party calls and signed URLs.
- **No microservices.** One database, one worker for book conversion.
- **Feature flags** (PostHog) per flow, so unfinished flows can ship dark.
- **Errors:** every screen has an error and offline state; Sentry on app, admin and functions.
- **Copy and design** come from the prototype and DESIGN.md. Reuse tokens; never hard-code colours.
- **Migrations** are forward-only and reviewed with the flow. Seed data mirrors the prototype (Ngozi, Harmattan Letters, Ifeoma).

## Environments
- **Local:** Supabase CLI, seed data, Expo dev client.
- **Staging:** its own Supabase project, RevenueCat sandbox, Flutterwave test keys, internal Play track.
- **Production:** separate project and keys. Only CI deploys.

CI on every pull request: typecheck, lint, unit and SQL tests. fastlane builds the app (Play internal track; TestFlight once iOS is set up); Vercel deploys the admin.

## Working with Claude
Start each flow with: "Build flow N from docs/prd/NN-*.md". Claude reads the flow file, writes the migration first, builds app and admin screens together, adds only the tests listed above, then runs `/code-review`.
