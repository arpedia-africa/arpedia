# Flow 17 · Launch

**Build order:** last · **Depends on:** every other flow (00–16) · **Prototype:** none. This flow adds no new screens; it uses maintenance mode, force update and feature flags from flow 16 (`s-config`).

**Owner decision, 23 Nov 2026: nothing is migrated from v25.** The new app starts fresh. No users, books, credits, subscriptions, highlights or history are imported. Every "Migration from v25" note in the other flow files is void; don't build any of it.

## Goal
Take the finished app from "every flow merged" to a full Play release: production set up, the main journeys proven end to end, a closed beta, then a staged rollout as an update to `com.arpedia.reader`.

**Success looks like:**
- A new reader can install, sign up, pay, unlock and read on production without help.
- 99.5% crash-free sessions during the first week at each rollout step.
- Payment webhook failures stay below 0.5%.

## Who does what
| Work | Who |
|---|---|
| End-to-end tests, set-up scripts, backups, release lanes, runbook, checklists | Builder, against local and staging only |
| Production secrets, store listing, legal text, real payments, beta group, sign-offs | Owner |
| Production deploys and every rollout step | Owner approves each one |

Builders never read `secrets.env`, connect to production or v25, or start a store rollout.

## Behaviour

**Replacing v25 on a phone**
1. The release uses `com.arpedia.reader`, the v25 upload key and a version code above **25** (v25's).
2. Installing over v25 must open without a crash, remove v25's old local data (session, downloads, caches), and land on the normal first-run screens. v25 logins don't work in the new app: readers create a new account.
3. Old push tokens are never reused. The phone registers again after sign-in.
4. **Old store purchases:** the RevenueCat project is shared with v25. A purchase event or Restore with a v25 product id that the new app doesn't sell grants **nothing**, returns success to RevenueCat so it isn't retried, and is listed for Finance. It never creates a subscription, credits or an error screen. If v25 and the new app use the same product id, see Q2.

**Production set-up**
5. `tools/launch/setup.mjs --target staging|production` is safe to repeat. It checks (and `--apply` creates) what a fresh database needs: plans, credit packs, pricing rules, genres, policy versions 1, app configuration, feature flags, scheduled jobs, queues. It never creates sample users or books, and stops if it finds seed data (`@example.com` users) in production.
6. The first Super admin is invited by email and must turn on two-step sign-in before seeing any page.
7. `tools/launch/preflight.mjs` prints pass or fail for: migrations applied, RLS on every table, no seed users, all Worker secrets present (names only), webhooks reachable and rejecting bad signatures, R2 buckets private, scheduled jobs running, Sentry and PostHog receiving, staging endpoints absent from the release build, `EXPO_PUBLIC_KIT` off.
8. **Backups:** a nightly encrypted database dump to R2, kept 30 days, with an alert if one is missed and a tested restore into a scratch database.

**Launch content**
9. The catalogue starts empty. Books are added through the normal pipeline (flow 12), by staff or authors. Preflight warns when fewer than the launch target are Live (Q3), and when a Home rail or Explore genre would be empty.

**Whole-app check**
10. New Maestro journeys run on one release build with every flow in it, at 375 and 320dp:
    - **Reader:** sign up → onboarding → Home → book page → preview → buy credits (test store) → unlock → read → highlight → Library → offline read → sign out and back in.
    - **Pay as you read:** charge → undo within 10 minutes → Pay the rest.
    - **Community:** join a club → message → room → report → block.
    - **Author:** apply → approved by staff → upload → review → live → a reader spends → earnings show the right naira.
    - **Account:** export data → delete account.
11. After the journeys, a check proves that every balance equals the sum of its ledger rows, and that author earnings equal credits spent × ₦1.60.
12. Security pass: `anon` and `authenticated` can't read or write anything they shouldn't (pgTAP sweep over every table and function), and chapter keys are refused without an entitlement.

**Beta and release**
13. `fastlane android closed`, `android production` (takes a rollout percentage) and `android halt` are added beside `internal`. Production runs only from a tagged release and needs approval in GitHub.
14. **Closed beta:** about 50 people for 14 days on production (Q4), using the Play closed track. Beta feedback comes in as `fix` issues.
15. **Rollout:** 5% → 20% → 50% → 100%, at least 48 hours apart. Each step needs crash-free sessions ≥ 99.5%, sign-in success ≥ 99%, no open money or access bug, and payment webhook failures below 0.5%. Missing one stops the rollout, and the owner decides what to do next.
16. **Undo:** halt the rollout, turn on maintenance mode if money or access is affected, fix, and release a higher version code. Play can't put a phone back on v25. The runbook says so in bold.
17. **iOS** ships later, once the partner account and its written agreement are ready (Q101 in OPEN-QUESTIONS).

## States and edge cases
- **Update installed while offline:** first-run screens with the normal offline state; v25 local data is still removed.
- **v25 email used to sign up:** treated as a new account, with no "already registered" message.
- **v25 subscriber contacts Support:** the macro explains that the new app is a fresh start and passes billing questions to Finance.
- **Deep link to a v25 book or room:** the normal "not found" screen.
- **Set-up script stops halfway:** running it again finishes the rest.

## Data
Migration `supabase/migrations/<timestamp>_17_launch.sql`: `unmatched_store_events` (`id`, `provider`, `event_id` unique, `product_id`, `app_user_id`, `received_at`, `resolved_by`, `resolved_at`, `note`). RLS: Finance and Super admin read; only the api Worker's function writes. No payload or personal data beyond these columns.

## Server
| Function | Who | Does |
|---|---|---|
| `log_unmatched_store_event(...)` | api Worker | Records a store event for an unknown product, once |
| `resolve_unmatched_store_event(id, note)` | Finance, Super admin | Marks it handled; writes `audit_log` |
| `launch_check()` | Service role | Returns the database part of preflight |
| Nightly backup job | Scheduled | Dumps, encrypts, uploads, alerts on failure |

## Admin side
No new screens. Unmatched store events are exported by `tools/launch/unmatched.mjs` for Finance.

## Analytics
`first_open_after_v25` (yes or no), `rollout_step` (percent), `unmatched_store_event` (product id). No personal data.

## Done when
**Built (builder)**
- [ ] All journeys in rule 10 pass on one release build on the emulator, at 375 and 320dp, and the money check in rule 11 is exact.
- [ ] pgTAP: access sweep (rule 12), unmatched events recorded once, only Finance and Super admin can read them.
- [ ] Vitest: unknown product ids grant nothing; set-up script is safe to repeat and refuses seed data in production; preflight fails on each missing item.
- [ ] A backup is taken and restored locally, and row counts match.
- [ ] Installing over a v25 build opens to first-run with no crash. This needs a v25 APK from the owner; otherwise it is marked "owner step".
- [ ] Release lanes validate without uploading.
- [ ] `docs/launch/RUNBOOK.md` and `docs/launch/STORE-CHECKLIST.md` (listing, Data safety form, content rating, privacy policy and account deletion links) exist.

**Launched (owner)**
- [ ] Every ★ question answered.
- [ ] Owner previews from earlier flows done on a real phone, including real push and a real purchase and refund.
- [ ] Preflight all green on production, beta finished, rollout at 100%.

## Not in this flow
Anything from v25's database, the iOS release, win-back campaigns, v25's website, and deleting the v25 project.

## Open questions
★ = the owner answers before the first production rollout. None blocks building.

| # | Question | Default |
|---|---|---|
| Q1 ★ | Does anyone still have an active v25 subscription, unused paid credits, or unpaid author earnings? v25's database has been paused since 19 Nov 2026, but Play keeps billing a v25 subscription until it is cancelled | Owner checks Play Console, RevenueCat and Flutterwave. Cancel and refund, or settle, before rollout |
| Q2 ★ | Do any new store products reuse a v25 product id? Then an old subscription would look like a new one | New product ids for everything |
| Q3 ★ | How many Live books before launch, and who adds them | 50, with no empty Home rail |
| Q4 | Beta group, length and launch date | 50 people, 14 days, date set after the whole-app check |
| Q5 | Production Supabase stays on the free plan (owner: no paid plans): no automatic backups, and it can pause when idle | Nightly backup job (rule 8) and a daily scheduled query so it never idles; preflight shows database size against the free limit |
| Q6 ★ | v25's stored personal data: how long it is kept and when it is deleted | Owner decides with the privacy policy; builders don't touch it |
| Q7 | Tell v25 users that the new app is a fresh start | Short note in the Play "What's new" text |
