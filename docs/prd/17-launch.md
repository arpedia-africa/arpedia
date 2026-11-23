# Flow 17 · Migration and launch

**Build order:** last · **Depends on:** every other flow (00–16) · **Prototype:** none. This flow adds no new screens; it uses `s-login` (flow 1), and maintenance mode, force update and feature flags (flow 16, `s-config`).

## Goal
Every v25 reader, author and staff member opens the new app, signs in with the login they already have, and finds their books, highlights, place and credits. Nobody loses something they paid for. The app then goes from closed beta to a full Play release as an update to `com.arpedia.reader`.

**Success looks like:**
- Every count and money total in the reconciliation report matches, or each difference is listed and signed off.
- At least 99% of migrated readers who try can sign in without contacting Support.
- 99.5% crash-free sessions during the first week at each rollout step.

## Who does what
| Work | Who |
|---|---|
| Importer, mapping code, tests, reports, release lanes, runbook | Builder, against local data only |
| v25 access, production secrets, store listings, legal text, sign-offs | Owner |
| Rehearsal and cut-over runs | Owner starts them, with a person watching |

**Builders never** connect to the v25 project or to production, never read `secrets.env`, and never start a rehearsal on real data, a cut-over or a store rollout. They build and test with a made-up v25 fixture database (rule 5).

## Behaviour

**The importer**
1. `tools/migrate-v25/` is a Node command-line tool with one step per area: `node tools/migrate-v25 <plan|run|report|verify> [--only users,books,…] --target local|staging|production`. `plan` writes nothing and prints what would change.
2. It reads v25 through a **read-only** database role (`V25_DATABASE_URL`) and refuses to start if that role can write. It writes to the new project through SQL functions in the `migration` schema.
3. **Safe to repeat.** Each imported row is recorded in `migration.id_map`. A second run updates nothing that a user has changed since, and never adds a second ledger row for the same source.
4. **`--target production`** needs all three: a signed-off rehearsal report for the same importer version, every ★ question below answered in `tools/migrate-v25/decisions.json`, and the owner typing the project reference. With any missing it stops before connecting.
5. **Fixture:** `tools/migrate-v25/fixture/` builds a small v25-shaped database from the v25 schema with invented people. It covers each edge case in this file. It contains no real personal data and no v25 secrets.
6. **Order:** staff and users → profiles → authors → books → entitlements → subscriptions and credits → progress and highlights → library and follows → community → earnings history → trust → preferences. A step stops if the one it depends on failed.

**What moves.** The rule for each area lives in that flow's "Migration from v25" note. This table only adds what those notes leave out.

| Area | v25 source | Rule owner | Added here |
|---|---|---|---|
| Users and logins | `auth.users`, identities, `profiles`, `reader_profiles` | 01 | Keep the v25 user id. Users with `deletion_requested_at` set are **not** imported |
| Staff roles | `profiles.role` | 16 | Q6. Staff start with no access until two-step is set up |
| Trending, Coming soon, notifications | `books` flags, `notifications` | 02 | Last 30 days of notifications only |
| Unlocked books, reviews | `book_unlocks`, `book_reviews` | 03 | Part-paid books, rule 9 |
| Progress, highlights, notes | `reading_progress`, `reader_annotations` | 04 | Rule 10 |
| Saved shelf | `saved_books` | 05 | — |
| Channels, clubs, messages, rooms | `community_*` | 06, 07 | Attachments move to R2, or the message shows "Attachment no longer available" |
| Follows, posts, direct messages | `follows`, `author_posts`, `author_private_messages` | 08 | `user_blocks` are imported **before** any message |
| Subscriptions, credits | `subscriptions`, `credit_wallets` | 09 | Rules 11–15 |
| Goals, notification settings | `reader_profiles`, settings | 10, 15 | Offers stay off without explicit consent |
| Authors and applications | `author_profiles` | 11 | — |
| Books | `books`, `book_files`, `book_revisions` | 12 | Rules 7–8 |
| Earnings history | `royalty_*` | 13 | Totals only (Q34 in OPEN-QUESTIONS). Unpaid amounts: rule 16 |
| Reports, tickets, claims, warnings | `content_reports`, `copyright_claims` | 14 | Open copyright claims keep their book hidden |
| Waitlist | `waitlist_signups` | 17 | Export for the launch email only; no account is created |

Not moved: offline downloads, device lists, push tokens, security events, conversion jobs, search history, raw payment responses. They stay in the v25 archive.

**Books**
7. Books go through the verification Worker like any upload, in batches. Each ends as **Live**, **With the desk** (needs fixing) or **Skipped** (removed or rejected in v25). The report lists every one with a reason.
8. Cut-over needs every book that any reader has unlocked or part-paid to be Live, and at least 95% of the other published books. A reader who paid for a book still with the desk sees it in their Library as "Being prepared".

**Entitlements and part-paid books**
9. v25 charged by percentage read (`book_credit_events`), so some readers have paid for part of a book. Their paid percentage (`charged_through_percentage`) becomes chapter entitlements for every chapter it **reaches into**, rounded up in the reader's favour, source `staff`, with one zero-delta `staff_adjust` ledger row. **Pay the rest** then counts those chapters as paid.

**Progress and highlights**
10. v25 stored a paragraph id for newer highlights and furthest positions. Use it to find the v25 paragraph text, match that text in the new revision, and fall back to the quote match and then chapter and percent (flow 4). A highlight that can't be placed keeps its text and note under "Couldn't place" in the report; it is never dropped.

**Credits and subscriptions**
11. The opening balance is written with the ledger's `staff_adjust` reason, inside one Postgres function, at most one row per user and bucket. No balance is ever set directly.
12. v25 keeps plan credits (`cycle_credits`) and bought credits (`topup_credits`) apart. Which bucket each goes to is Q1; the exchange rate for bought credits is Q2. v25's own rows before that split counted the whole balance as bought.
13. **v25 plans:** Monthly, Quarterly, 6 months and Yearly. Existing subscribers keep the price, period end and credit allowance they paid for until the period ends. The 6-month plan has no match in the new app: it is imported as a legacy plan that can't be bought or renewed (Q3).
14. The store stays the truth for store subscriptions. The importer takes the period end from RevenueCat, and v25's own row only for web payments. RevenueCat customer ids stay the same because user ids do, so nobody needs to tap Restore.
15. **Refill guard:** the first RevenueCat event after cut-over must not grant a period's credits that v25 already granted. Compare on the store transaction id.

**Author money**
16. Earnings on v25 credit events still on hold or unpaid are worked out **once, at the v25 rate**, and imported as a legacy closed cycle per author, waiting for a normal payout approval (flow 13). The importer never sends a payout. Q4 covers who signs off the total.

**Reconciliation**
17. `verify` compares both sides and writes `report.md` plus CSV files: users, staff, authors, books by outcome, entitlements, subscriptions by plan, progress, highlights (placed, moved, not placed), messages, follows, and these money totals: credits by bucket, naira value of bought credits at what readers paid and at ₦3, and unpaid author earnings. It marks every difference.
18. Reports use user ids only, with no names, emails, phone numbers or message text. They are saved outside the repository and never committed or attached to a PR.

**Rehearsal (staging)**
19. At least two full rehearsals. The second must be clean: no unexplained differences and no manual fixes.
20. **Personal data is scrubbed on load** into staging: emails become `user-<id>@example.invalid`, and names, phone numbers, dates of birth, message text and bank details are replaced. Logins are checked with team accounts only. Staging can't send email, push, SMS or payouts; the importer checks that each of those is off and stops otherwise.
21. The rehearsal times each step. If a full run takes more than 4 hours, it gets an early bulk run and a short final run of changes only.
22. Scrubbed data is deleted from staging after sign-off.

**Cut-over** (the steps live in `docs/launch/RUNBOOK.md`, with an owner, expected time and undo for each)
23. One week before: an in-app notice and an email to v25 readers with the date. Cut-over runs overnight, 00:00–06:00 WAT, not within 3 days of a payout day or the 1st of a month.
24. New app in maintenance mode → v25 stops accepting changes (owner step) → full backups of both databases, with a test restore of the new one → final run → `verify` → smoke tests with team accounts → **go or no-go**, decided by the owner → maintenance off.
25. Payments that arrive during the freeze (Flutterwave and RevenueCat webhooks) are queued and replayed into the new system. None is lost, and none is applied twice.
26. **Undo** is possible until the first new reader action is accepted: v25 accepts changes again and the new app stays in maintenance. After that point problems are fixed forward. The runbook says so in bold at the go or no-go step.
27. v25 stays read-only for 30 days. It is then archived to encrypted storage, and removed only when the owner says so.

**Beta and release**
28. The Play release uses `com.arpedia.reader`, the v25 upload key and a version code above **25** (v25's). An update over an installed v25 app must open without a crash, clear v25's old local data, and ask the reader to sign in once if the session can't be carried over.
29. **Closed beta** (Play closed track, about 50 people for 14 days) runs on production infrastructure with its own test accounts. It starts after the second rehearsal.
30. **Rollout:** 5% → 20% → 50% → 100%, at least 48 hours apart. Each step needs: crash-free sessions ≥ 99.5%, sign-in success ≥ 99%, no open money or access bug, and payment webhook failures below 0.5%. Missing one stops the rollout, and the owner decides what to do next. The first 5% starts straight after cut-over.
31. v25 app copies that haven't updated can read but not buy, because v25 is read-only. They show the update message if v25 supports one (Q5).
32. `fastlane android closed`, `android production` (takes a rollout percentage) and `android halt` are added beside `internal`. Production runs only from a tagged release and needs approval in GitHub.
33. **iOS** ships later, once the partner account and its written agreement are ready (Q101 in OPEN-QUESTIONS). v25 iOS subscribers are emailed, and whoever holds the old Apple account stops new sales there.

## States and edge cases
- **Same email twice in v25** (different case, or Google and password): one account. Entitlements are combined, balances are added, and the pair is listed in the report. Accounts are never merged by phone number.
- **No email, phone only:** imported. Sign-in follows flow 1's reset path.
- **Unsupported password hash:** flow 1's "Forgot password" message on `s-login`.
- **Username taken or not allowed:** a number is added, and the reader is told once on Profile.
- **Negative or missing v25 wallet:** imported as 0 and listed. Never a negative opening row.
- **Subscription ended during the freeze:** imported as ended.
- **Author deleted or suspended, book still unlocked:** readers keep the book, and payouts for that author are paused.
- **Migrated reader offline at first open:** the normal sign-in offline state. Nothing on the phone is deleted until sign-in succeeds.
- **A step fails halfway:** that area rolls back as a batch, earlier areas stay, and `run --only` continues.

## Data
Migration `supabase/migrations/<timestamp>_17_migration.sql`:

| Table or column | Notes |
|---|---|
| `migration.runs` | `id`, importer version, target, started, finished, status, report hash, signed off by and when |
| `migration.id_map` | `area`, `v25_id`, `new_id`, `run_id`, `source_hash`; unique (`area`, `v25_id`) |
| `migration.issues` | `run_id`, `area`, `v25_id`, `kind`, `detail` (no personal data), `resolved_at` |
| `subscriptions.legacy_terms` | jsonb, null for everyone else: v25 plan code, allowance, refill interval, last granted at |

The `migration` schema isn't exposed through the API. RLS is on with no policies, and only the importer's database role can use it. The schema is removed 30 days after cut-over, once `id_map` is archived.

## Server
| Function | Who | Does |
|---|---|---|
| `migration.import_<area>(jsonb[])` | Importer role | Imports one batch in one transaction, recorded in `id_map` |
| `migration.open_balance(user, bucket, credits, source)` | Importer role | Writes one `staff_adjust` ledger row, once only |
| `grant_legacy_credits()` | pg_cron, daily | Gives legacy subscribers their remaining v25 allowance on the right day, until `ends_at` |
| api Worker, webhook hold | Maintenance mode on | Queues payment webhooks and replays them in order with the normal duplicate checks |

## Admin side
No new screens. Staff see migrated rows through the existing pages, with ledger notes that start "v25". Maintenance mode, minimum version and flags use flow 16's `s-config`. Every run is written to `audit_log`.

## Analytics
`migrated_sign_in` (result, method), `migrated_first_open` (from version), `legacy_credits_granted`, `rollout_step` (percent). No personal data.

## Done when
**Built (builder, fixture data only)**
- [ ] `plan`, `run`, `report` and `verify` work end to end on local Supabase from the fixture, and a second `run` changes nothing.
- [ ] pgTAP: opening balances are written once only, ledger totals equal the fixture totals, the `migration` schema can't be reached by `anon` or `authenticated`, and legacy grants stop at `ends_at`.
- [ ] Vitest: position and quote matching, part-paid rounding, duplicate email merging, scrubbing (no fixture name, email or phone number survives), and the production guards in rule 4.
- [ ] Payment webhooks sent during maintenance are applied exactly once after it ends.
- [ ] Emulator: installing the new app over a v25 build opens to sign-in with no crash, at 375 and 320dp. This needs a v25 APK from the owner; otherwise it is marked "owner step".
- [ ] Release lanes validate without uploading, and `docs/launch/RUNBOOK.md` and `docs/launch/STORE-CHECKLIST.md` (listing, Data safety form, content rating, privacy policy and account deletion links) exist.

**Launched (owner)**
- [ ] Every ★ question answered in `decisions.json`.
- [ ] Two rehearsals, the second clean, signed off.
- [ ] Pending owner previews from earlier flows done on a real phone, including real push and a real purchase and refund.
- [ ] Beta finished, cut-over verified, rollout at 100%.

## Not in this flow
The iOS release itself, moving v25's website, win-back campaigns, bulk public domain uploads, and deleting the v25 project.

## Open questions
★ = must be answered by the owner before rule 4 allows a production run. Builders use the default on fixture data.

| # | Question | Default |
|---|---|---|
| Q1 ★ | Which bucket do unused v25 **plan** credits go to? Flow 9's note says plan credits stay plan credits; OPEN-QUESTIONS Q14 says everything becomes never-expiring top-up credits | Q14: everything to top-up (better for readers, but costs more) |
| Q2 ★ | v25 sold credits at ₦5, ₦4 and ₦3.33 each; here a credit is ₦3. Moving them 1 for 1 means 100 credits bought for ₦500 are worth ₦300. Should bought credits be topped up? | 1 for 1 on fixture data. The report prices 1 for 1 and × 5 ÷ 3 side by side so the owner can choose |
| Q3 ★ | v25 6-month, Quarterly and Yearly subscribers: keep their v25 allowance until the period ends? v25 sets 900, 1,800 and 3,600 credits with a refill interval of 1 month, so confirm whether that is per month or for the whole period | Keep it. Treated as the total for the whole period, spread monthly |
| Q4 ★ | Unpaid v25 author earnings: who signs off the total, and the date v25's last payout covers | Owner and Finance, before cut-over |
| Q5 ★ | How v25 is made read-only, and whether its app can show an update message (it has an over-the-air update folder) | Owner step in the runbook; no change to v25 by builders |
| Q6 ★ | Staff roles: flow 16's note says v25 had `admin` and `editor`, but its schema has `admin` and `publisher` | `admin` → Super admin, `publisher` → Publisher, then reviewed person by person |
| Q7 ★ | Production Supabase plan: the free plan has no automatic backups and can pause when idle | Paid plan before cut-over, or a nightly backup job to R2 |
| Q8 ★ | Consent: does v25's privacy policy cover moving accounts to a new provider project, and is notice or fresh acceptance needed? | Show the updated Terms and Privacy at first sign-in (flow 16 policy notice), and email everyone a week before |
| Q9 | Launch date and beta group | Set by the owner after the first rehearsal |
