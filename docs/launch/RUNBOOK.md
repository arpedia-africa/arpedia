# Launch runbook

How the new app goes from "every flow merged" to 100% of Play users as an update to `com.arpedia.reader`, and what to do when something goes wrong. Spec: [docs/prd/17-launch.md](../prd/17-launch.md). Store items: [STORE-CHECKLIST.md](STORE-CHECKLIST.md).

**Nothing is migrated from v25** (owner decision, 23 Nov 2026). The new app starts fresh: v25 users create a new account.

> **Play can't put a phone back on v25.** Once a phone has the new app, the only way forward is a newer version. Every "undo" below is: halt, protect, fix, release a higher version code.

## Who does what
| Step | Who |
|---|---|
| Production secrets, Play listing, legal text, beta group, every rollout step | Owner |
| Running the commands below against production | Owner, or a builder the owner sits with |
| Builders | Local and staging only. Never production, never Play |

## 0. Before anything: owner decisions (★ in the spec)
- [ ] **Q1** Check Play Console, RevenueCat and Flutterwave for v25 money still in flight: active v25 subscriptions, unused paid credits, unpaid author earnings. Cancel and refund, or settle, **before the first rollout step** (Play keeps billing a v25 subscription until it is cancelled).
- [ ] **Q2** Confirm no new Play product id reuses a v25 one (default: all new). A reused id would make an old subscription look like a new one.
- [ ] **Q3** Launch catalogue: 50 Live books (default), no empty Home rail. Preflight warns until it's met.
- [ ] **Q6** How long v25's stored personal data is kept and when it's deleted (with the privacy policy). Builders don't touch it.

## 1. Settings each tool needs (names only)
Export these in your shell (or GitHub environment) for the target. Never commit them.

| Tool | Settings |
|---|---|
| `tools/launch/setup.mjs` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `ADMIN_URL`, `RESEND_API_KEY` (optional) |
| `tools/launch/preflight.mjs` | the above, plus `API_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECTS`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` |
| `tools/launch/backup.mjs` | `SUPABASE_DB_URL`, `BACKUP_KEY`, `R2_*` |
| `tools/launch/unmatched.mjs` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

**api Worker (staging and production):** besides the secrets in `workers/api/wrangler.jsonc`, set `ADMIN_URL`, `PUBLIC_API_URL` and `PUSH_MODE=expo` (as secrets or vars), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_API_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, `PAYOUT_ACCOUNT_KEY`. Preflight lists any that are missing.

## 2. Production set-up (rule 5, 6)
Safe to repeat: each step checks first, and a second run changes nothing. If it stops halfway, run it again.

```sh
node tools/launch/setup.mjs --target production                 # report only
node tools/launch/setup.mjs --target production --apply \
  --admin-email you@arpedia.africa --admin-name "Your Name"
```
It:
1. **Stops before changing anything if production has seed accounts** (`@example.com`, `@test.local`).
2. Applies missing migrations (`supabase db push`). They create the plans, credit packs, pricing rules, genres, policy versions 1, app configuration, feature flags, scheduled jobs and queues. It never creates sample users or books.
3. Invites the **first Super admin** by email while there is none (`invite_first_super_admin`). Without `RESEND_API_KEY` it prints the one-time link (72 hours) for you to send. They set a password and **must turn on two-step sign-in before the console shows any page**. Running it again doesn't send a second invite (`--resend-invite` sends a fresh link).

Then, by hand:
- [ ] R2 bucket `arpedia-backups` created, private, with an API token scoped to it (read and write) for `R2_*`.
- [ ] GitHub environment `backup` with `SUPABASE_DB_URL`, `BACKUP_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `NTFY_TOPIC`, and variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- [ ] GitHub environment `production` (add yourself as a required reviewer if the plan allows it) and the repository variable `RELEASE_APPROVERS` (your GitHub login).
- [ ] `BACKUP_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Keep a copy outside GitHub** (password manager). Without it no backup can be read.

## 3. Preflight (rule 7)
Before the beta and before **every** rollout step:
```sh
node tools/launch/preflight.mjs --target production --bundle app-release.aab
```
(`app-release.aab` is the `app-release-aab` artifact of the Release Android run.) It exits 1 if anything fails; warnings don't block. It checks:

| Check | Pass when |
|---|---|
| migrations | every file in `supabase/migrations` is applied |
| rls | RLS is on for every table |
| seed_users | no `@example.com` or `@test.local` accounts |
| api/chat_worker_settings | every required secret or var exists (names only) |
| api_health, webhook_revenuecat, webhook_flutterwave | the Worker answers as production, and both webhooks reject a bad signature with 401 |
| r2_private | no r2.dev URL or custom domain on the books and backup buckets |
| scheduled_jobs, scheduled_job_runs, queues | every job active, none failed in 24 hours, every queue exists |
| super_admin | at least one Super admin with two-step on |
| backups | a backup under 26 hours old |
| sentry, posthog | events received in the last 24 hours (send a test event on a fresh project) |
| release_endpoints, expo_public_kit | no staging or local URL in the bundle; built without `EXPO_PUBLIC_KIT` |
| live_books, empty_genres, empty_home_rails (warn) | 50 Live (Q3), no empty genre or Home rail |
| database_size (warn at 80%) | under the free plan's 500 MB |
| unmatched_store_events (warn) | Finance has handled every v25 store event |

## 4. Backups (rule 8, Q5)
The free plan has no automatic backups and pauses an idle project.
- **Nightly** (`.github/workflows/backup.yml`, 02:00 Lagos): data of the `public` and `auth` schemas → gzip → AES-256-GCM (`BACKUP_KEY`) → `arpedia-backups/db/<date>.sql.gz.enc`; backups older than 30 days are deleted. The same run makes a REST query so the project never idles.
- **Alarm** (14:00 Lagos): fails if the newest backup is over 26 hours old (also catches a nightly run that never started). Both alert on ntfy.
- **Not in a backup:** the schema (it's the migrations), queue messages in flight, the vault.

### Restore drill
Do this once before launch and then every month, into a **scratch** project (never the live one):
1. Create a scratch Supabase project (or run `supabase start` locally) and apply the migrations: `supabase db push --db-url <scratch>`.
2. Restore the newest backup into it:
   ```sh
   node tools/launch/backup.mjs restore --target production --key db/<newest>.sql.gz.enc \
     --into <scratch db url> --yes-wipe
   ```
   It empties every table, loads the rows with triggers off, then checks every table's row count against the dump. It exits 1 on any mismatch.
3. Spot-check: sign in to the scratch admin with your account; a reader's balance equals their ledger.
4. Delete the scratch project.

Local drill on 23 Nov 2026 (second stack): dump → `db reset` → restore: 181 tables, 6,191 rows, all counts matched; a row added before the dump came back and one added after the reset was gone.

**After an incident** (data lost on production): put the app in maintenance mode (Admin → Settings → App configuration), restore into a new project, check it, then point the Workers and app at it, or restore into the live database with `--into-live`. A restore loses what happened after the backup (up to 24 hours): Finance reconciles payments from RevenueCat and Flutterwave for that window.

## 5. Replacing v25 on phones (rules 1–3)
- The release keeps `com.arpedia.reader` and the v25 upload key. Version codes start at **26** (`app.json`) and fastlane always uploads above the highest code on any track.
- **First launch after the update** (`apps/mobile/plugins/v25-cleanup.js`): before anything else starts, the app removes all local data (v25's session, downloads, caches, databases, preferences) and its Keystore keys, then opens the normal first-run screens, online or offline. It runs once.
- Old push tokens are never reused: the phone registers again after sign-in.
- Deep links to v25 books or rooms open the normal "not found" screen. A v25 email signs up as a new account, with no "already registered" message.

### Owner step: v25 install check (no v25 APK in the repo)
On a test phone (not the owner's daily one):
1. Install v25 from Play (or its last APK), sign in, open a book, download one.
2. Install the new release over it (internal track, or `adb install -r app-release.apk`).
3. Open it: **no crash, the first-run screens, signed out**. Settings → Apps → Arpedia → Storage shows only the new app's data.
4. Repeat with flight mode on before step 3: first-run screens with the offline state.
5. Note the result in the flow 17 PR.

## 6. Old store purchases (rule 4)
The RevenueCat project is shared with v25. A v25 purchase, renewal or Restore with a product id the new app doesn't sell **grants nothing**, answers RevenueCat 200 (so it isn't retried) and is listed for Finance once (`unmatched_store_events`).
```sh
node tools/launch/unmatched.mjs --target production --out unmatched.csv   # open events
```
Finance refunds or settles each in Play Console or RevenueCat, then marks it handled (Finance or Super admin, two-step on; audited):
```sql
select public.resolve_unmatched_store_event(<id>, 'Refunded in Play Console');
```
**Support macro (v25 subscriber):** "Arpedia has a brand-new app, and it's a fresh start: accounts, credits and subscriptions from the old app don't carry over. Please create a new account. For anything you paid for in the old app, our Finance team will contact you about a refund." Then assign the ticket to Finance.

## 7. Release steps (rules 13–15)
All from GitHub: **Actions → Release Android → Run workflow**.

| Step | How | Gate |
|---|---|---|
| Internal | push a tag `v26.0.0` (or Run, lane `internal`) | CI green on main |
| Closed beta | Run, lane `closed` | preflight green |
| Production 5% | Run **from the tag**, lane `production`, percent `5` | preflight green, beta finished |
| 20% → 50% → 100% | same, percent `20`, `50`, `100`, **at least 48 hours apart** | the gates below |

`validate-lanes` runs with every manual run and checks each lane's logic without calling Play.

**Closed beta (Q4 default):** about 50 people for 14 days on production, through the Play closed track. Feedback comes in as GitHub issues labelled `fix`.

**Gates for every step** (measured over the step's first 48 hours; missing one stops the rollout and the owner decides):
- crash-free sessions ≥ 99.5% (Sentry → Releases → the version)
- sign-in success ≥ 99% (PostHog: successful sign-ins ÷ attempts)
- no open money or access bug (GitHub issues labelled `fix` that touch credits, payments, unlocks or sign-in)
- payment webhook failures < 0.5%:
  ```sql
  select round(100.0 * count(*) filter (where error is not null) / nullif(count(*), 0), 2) as failed_pct
  from public.payment_events where received_at > now() - interval '48 hours';
  ```

**What's new (Q7 default):** "A brand-new Arpedia. This is a fresh start: please create a new account. Anything you paid for in the old app, contact us and we'll sort it out."

## 8. Undo (rule 16)
> **Play can't put a phone back on v25.** There is no rollback to an older version, only forward.

1. **Halt:** Run Release Android, lane `halt`. Phones that already updated keep the new version; nobody else gets it.
2. **Protect:** if money or access is affected, turn on **maintenance mode** (Admin → Settings → App configuration). Readers see the maintenance screen; no money moves.
3. **Fix** on a `fix/<issue>` branch, merge, tag a new version (higher version code is automatic).
4. Release it: internal → (beta if needed) → production starting again at 5%.
5. Turn maintenance mode off once the fixed version is live.

## 9. iOS (rule 17)
Ships later, once the partner's Apple account and written agreement are ready (Q101). Lanes `ios beta` and `ios release` exist; nothing here starts them.

## 10. Known gaps before launch
- **Google Play purchases aren't wired yet:** `apps/mobile/features/09/purchases.ts` is a stub (RevenueCat's SDK isn't a dependency). Readers can't buy or restore on Play until it is. Flow 09 owns it.
- Analytics `rollout_step` isn't sent by the app (the app can't see Play's rollout share); read it from Play Console. `unmatched_store_event` goes to the Worker log and the table, not PostHog (the api Worker has no PostHog client).
