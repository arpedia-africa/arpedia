# Spec check: flows 00 to 16

Builder C, 23 Nov 2026. Read-only audit of `origin/main` (a4d80e2) and `origin/flow/17-journeys` against `docs/prd/00-*.md` to `16-*.md`.

Each row is a gap: a rule, state, server job, notification, email or analytics event the code does not really do end to end. Rules that are fine are left out. Severity: **blocks launch** / **should fix** / **later**. Who: **A** server or code, **B** app screens (emulator-testable), **owner** account, payment, legal or product decision.

## Totals

_In progress. Order: 04, 09, 13, 14, 12, 03, then 00 to 16._

## Launch blockers

_In progress._

## 00 · Foundation

| | Id | Rule | What is missing | Where | Severity | Who |
|---|---|---|---|---|---|---|
| - [ ] | 00-1 | Done when 7 (staging health) | Staging and production `SUPABASE_URL` are placeholder hosts (`arpedia-staging.supabase.co`, `arpedia.supabase.co`), not real project refs, so JWKS verification and the health route cannot answer on staging until real projects, R2 buckets and secrets exist. | `workers/api/wrangler.jsonc:30` (also `workers/chat/wrangler.jsonc:25`) | should fix | owner |
| - [ ] | 00-2 | 24 | No real branch protection on `main`: `main-guard.yml` only sends an ntfy alert after a direct push; nothing stops a merge with red gates. | `.github/workflows/main-guard.yml:1` | should fix | owner |
| - [ ] | 00-3 | 12 | The offline banner is only mounted in the tabs layout. Stack screens (reader, checkout, book, account, studio, rooms) show no offline banner. | `apps/mobile/app/(tabs)/_layout.tsx:30` (should also be in `apps/mobile/app/_layout.tsx`) | should fix | B |
| - [ ] | 00-4 | 11 | PostHog feature flags are never read: only `capture` is used and no flag hook or `isFeatureEnabled` call exists anywhere in the app. | `apps/mobile/src/lib/telemetry.tsx:15` | later | B |
| - [ ] | 00-5 | 23 / Done when 8 | The Maestro kit-gallery smoke test runs only nightly and on demand, not on pull requests. Draft PRs skip every gate. The file's own comment says this was deliberate, but the spec says PR. | `.github/workflows/ci.yml:107` | later | A |
| - [ ] | 00-6 | 13 | The command palette searches only console page names, but the top bar promises "Search readers, books, authors, payments". The empty state also admits records are not searchable. | `apps/admin/components/shell.tsx:133` | later | A |
| - [ ] | 00-7 | 13 | TanStack Table is a dependency but no admin file imports it. The tables do not use it for data and sorting logic. | `apps/admin/package.json:19` | later | A |
| - [ ] | 00-8 | 13 | The top-bar bell ("Staff alerts") is a plain link to `/account` and shows no alerts. | `apps/admin/components/shell.tsx:143` | later | A |
| - [ ] | 00-9 | 10 (iOS) | The iOS fastlane lanes exist (`match`, `gym`, `pilot`), but no workflow runs them. The Apple team, `APPLE_TEAM_ID`, the certificates repo and the App Store Connect key are not set up. | `apps/mobile/fastlane/Fastfile:144` (no iOS workflow in `.github/workflows`) | later | owner |

45 rules checked, 9 gaps.
