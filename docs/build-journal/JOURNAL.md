# Arpedia build journal

A running record of **how Arpedia was built**: the setup, the decisions, what went wrong and how it was fixed. It is the raw material for a build guide and, later, a tutorial ("Build a production app with a team of AI builders").

Each entry has a date, what happened, and the **lesson** (what a reader should copy or avoid). New entries go at the bottom of the timeline. No secrets or personal details here.

---

## 1. The system in one page

**Product:** Arpedia, an African subscription reading community. Android app (Expo, React Native), web admin console (Next.js), Supabase (Postgres + Auth), Cloudflare (Workers, Durable Objects, R2).

**How the work is organised:**

| Piece | What it is | Where |
|---|---|---|
| Prototypes | Clickable HTML prototypes of every app and admin screen. The visual source of truth. | `prototype/`, `admin/` |
| Screen tools | Print a prototype screen's markup/CSS, capture reference PNGs, compare built vs prototype side by side | `tools/screen.mjs`, `tools/shot.mjs`, `tools/parity.mjs` |
| Flow specs | One file per user flow (18 flows): goal, screens, data, server, tests. Plus rules, architecture, build steps, build plan. | `docs/prd/` |
| Status | Flows, lanes, dependencies, answered questions | `docs/prd/status.json` |
| Builder prompt | The instructions every AI builder run follows | `docs/prd/BUILDER-PROMPT.md` |
| Builder loop | PowerShell loop that runs the Claude CLI headless, one run after another | `tools/build-loop.ps1` |
| Notifier | Pushes progress to the owner's phone (ntfy) and refreshes the live checklist issue | `tools/notify-loop.ps1`, `tools/checklist.mjs` |
| Merge gate | GitHub Actions: CI on ready PRs, `merge-when-green` merges when every check passes | `.github/workflows/` |

**The loop, per flow:** migration + RLS → Workers → app and admin screens → listed tests → code review → phone checks → mark ready → CI → auto-merge.

**State lives on GitHub, never in a session.** Each flow is a branch `flow/NN-name` and a draft PR labelled `flow-NN`, whose description holds a Progress checklist, **Next step** and Notes. Any builder (or another person's Claude account) can pick up from Next step at any time.

---

## 2. Before the build (to 17 Nov 2026)

- **Design first.** Built the full app and admin prototypes as HTML before any code, iterated with the owner screen by screen (feedback stored per screen, sent to Claude, implemented, marked done). Design direction "vibrant African", 4 themes, icons from one sprite.
- **Specs per flow, not a big methodology.** Tried a heavyweight agile method (BMAD), dropped it for one short spec per flow plus a build plan. Lesson: AI builders do best with small, self-contained specs they can read in one go.
- **Open questions with defaults.** Every unanswered product question got a default in `OPEN-QUESTIONS.md`; the owner accepted defaults in bulk so builders never block. Builders note each default they use in the PR.

**Lesson:** prototypes + per-flow specs + default answers = builders that can run unattended.

---

## 3. Timeline

### 17 Nov — set-up day
- Repo created with PRD, prototypes, setup guide and screen tools.
- **Cloud routines first, then a local CLI loop.** Cloud agents can't reach the owner's phone or local Docker, so the main builder became a local headless `claude -p` loop (`build-loop.ps1`).
- **ntfy notifier** sends each run's report to the owner's phone.
- **Free GitHub plan:** no required reviewers or merge queue, so we wrote our own `merge-when-green` workflow plus a main-guard; CI runs only on PRs marked ready.
- Loop fixes: don't spin while CI runs (`WAITING-FOR-CI` → wait 8 min), only stop on the CLI's real usage-limit message (a report mentioning "rate limits" stopped it once).
- **Exact-replica rule** written: admin reuses the prototype CSS verbatim; every app component mirrors a prototype element one to one.
- **Devices:** the owner's phone (375 dp wide) became the main test device.

**Lessons:** headless runs need explicit stop words (`NOTHING-TO-DO`, `WAITING-FOR-CI`) so the loop knows how long to wait. Run long commands in the foreground: background jobs die with the run.

### 18 Nov — flow 00, parallel builders, quality bar
- **Flow 00 Foundation merged** (monorepo, CI, branch protection, Expo with fastlane, no EAS).
- **Android CI moved to nightly only.** Emulator CI on every PR was slow and flaky; phone Maestro runs gate PRs instead, a failed nightly opens a `fix` issue.
- **Several builders at once:** lanes (L1 critical, L2 product, L3 money/ops), `-Lane` and `-Flows` switches, separate clones per loop.
- **Locks** for shared resources: `phone.lock` and `db.lock` (a directory created with `mkdir`, stale after 30 min), kept in a folder the headless CLI is allowed to write (`--add-dir`).
- **320/360 dp checks on the real phone** by changing `wm density` (1080 px ÷ (dpi/160) = dp), always restoring the owner's 461. The emulator didn't fit in RAM.
- **Fast screen loop:** a debug "dev build" (`com.arpedia.reader.dev`, beside the release app) on Metro, so visual fixes reload in seconds instead of a 10-minute release build.
- **Owner decision: the owner judges screens.** The pixel-diff % became advisory after builders burned hours on sub-pixel text offsets. New bar: "very, very good, not perfectionist" (designer's eye, real and long data, 4 themes, every state, motion).
- **Owner preview:** at the end of each app flow, the release app is left on the phone against the local stack with demo logins.
- **Live checklist** (issue #5) regenerated every 10 min from status.json, the flow files and the PRs.
- **merge-when-green 403:** the workflow lacked `checks: read`. Fixed in PR #6; flow 12 then auto-merged.
- **Stacked start** (owner approved): a flow may start on top of a dependency whose PR only waits on phone checks, then rebase onto main once it merges.

**Lessons:**
- Shared hardware needs locks from day one.
- Writing Windows paths from Python: use raw strings (`\a` became a control character and broke the lock path).
- Commit specific files, never `git commit -a`, when the owner keeps uncommitted drafts in the same folder.
- Pixel scores are a review aid, not a gate.

### 19 Nov — contention day
- **Flow 01 Sign-in merged** (00:02), **flow 06 Community merged** (23:27).
- Internet outage 01:45–07:37 (~6 h); builders waited and resumed on their own (offline check + quick retry on dropped connection).
- **PC out of memory** (292 MB free of 16 GB): PowerShell timeouts, database container unhealthy. Freed memory by stopping a stale second database stack, a gradle daemon, a chat app and another project's local database.
- **PC restarted** (Windows) at 12:46; all loops died. Restarted them. Lesson: set Windows active hours.
- **Phone contention:** three builders fought over the phone. Long runs passed 30 min, so others took the "stale" lock mid-test; builders killed each other's Metro on port 8081.
  - Fix: **one phone builder** (`-PhoneOnly`) does only on-device steps of `needs-phone` PRs, oldest first. The other builders run `-NoPhone` and hand off with the `needs-phone` label.
  - **Lock heartbeat:** the holder `touch`es the lock every 10 min, so a working builder never loses it.
  - Never kill port 8081 while another builder holds the phone.
- **MIUI install prompt:** the "Install" button flashed and couldn't be tapped. Cause: MIUI needs "USB debugging (Security settings)" as well as "Install via USB".
- **Owner request:** builders bring the app back to the front themselves (`monkey -p <pkg> 1`) instead of waiting when the owner leaves another app open.
- **Database contention:** the phone builder held the shared database for hours (Maestro + owner preview). Fix: a **second local stack** for no-phone builders (`tools/db2.mjs`, project `arpedia-b`, ports 556xx, no Studio, `db2.lock`).

**Lessons:**
- One owner per scarce resource beats clever locking.
- Locks need a heartbeat, not just an age.
- Watch memory: every builder, database stack and Android build costs 1–2 GB.

### 20 Nov — the phone queue
- **Flow 03 Book page merged** (03:34). 5 of 18 merged; 12 flows code-complete, waiting only for phone checks.
- Phone sat on its PIN lock screen for ~2–3 h overnight. Lesson: Stay awake + longest screen timeout while plugged in.
- **Owner decision: lighter phone checks.** Parity at 375 dp only (4 themes); Maestro at 320/360/375 covers narrow widths; owner preview every third flow. About 40% less phone time.
- **App chooser risk:** release and dev builds both handle `arpedia://` links, so Maestro's `openLink` could stop on "Open with". `maestro-widths.mjs` now disables the dev build during runs and re-enables it after.

- Phone unplugged ~09:44–10:19; then the owner used the phone (WhatsApp, banking, music) during runs, cutting every Maestro run short. The real blocker on a shared personal phone is the owner's own use.
- **Maestro driver install:** MIUI blocks `adb install` of Maestro's driver until someone taps "Install". Fix used: extract `maestro-app.apk` and `maestro-server.apk` from `maestro-client.jar`, `adb install` them once while the owner watches, then Maestro reuses them. Also allow Maestro to start apps from the background (MIUI permission).
- **MIUI hide-keyboard = Back:** Maestro's `hideKeyboard` presses Back on MIUI, which closed the app on the sign-in screen. Fix: tap a heading to drop the keyboard instead.

- **Owner decision: emulator first (15:50).** One PR had taken ~4 h of phone time, mostly reruns after the phone was used. Closed every desktop app except the IDE, Claude and Chrome, paused the two idle no-phone builders and the second database (free RAM 0.4 → 3.1 GB), and booted an Android 36 x86_64 emulator at `wm density 461` (375 dp, the same width as the phone). Maestro and parity now run on `emulator-5554`; the owner's phone is only for owner previews. The arm64 phone APK crashes on the emulator, so builds for it use the default x86_64 arch.

- **Flow 02 Discovery merged (17:48)**, the first flow tested fully on the emulator: Maestro passed at 375/360/320 on the first try, plus parity in 4 themes. After 6 h of failed phone runs it took about 2 h on the emulator, including the first x86_64 build (~55 min with memory tight). 6 of 18 merged.

**Lesson:** with AI builders, the bottleneck moves to the physical device. Plan device time (a second test phone, overnight runs) as carefully as code.

### 20–21 Nov night — two devices, then a full disk
- **Two device builders** (owner request, 23:10): `build-loop.ps1 -PhoneOnly -Device <serial>`, one loop per device. Each owns `dev-<serial>.lock`, claims its PR with `pr-<n>.lock`, and the phone builder uses the second database with `adb reverse` mapping the app's ports (55321, 8787, 8788) to the second stack's. Also set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`: the CLI cut long Maestro runs off after 10 minutes.
- **Emulator window closed** (~00:05); restarted, apps and Maestro driver survived.
- **Disk full (~02:20 → 03:45):** C: had 0.24 GB left and adb hung, so both builders sat idle for ~1.5 h. Cause: Maestro copies its ~90 MB driver APK into the temp folder on every run (`tmp<digits>.apk`) and never deletes it. Deleting them plus stale temp files freed 19.7 GB; `maestro-widths.mjs` now cleans them up after each run.

**Lessons:** watch disk as well as memory; test tools leave files behind. A headless builder that can't kill processes needs a human (or a watchdog) when adb hangs.

### 21 Nov — back to one emulator
- MIUI refused every USB install of Maestro's driver ("Install canceled by user", instantly, even with the owner tapping), so the owner chose **emulator only**. The phone builder was stopped and its PR went back to the queue.
- Internet down 08:07–08:51; the loop waited and resumed.
- **Flow 11 Author Studio merged (10:49)**, after ~15 h across runs (most lost to the disk, adb, emulator restarts and the outage). 19 screens in 4 themes on the emulator; the "blank" preview screen was the parity tool opening the wrong screen. 7 of 18 merged.
- Owner chose to stay on the local emulator rather than move device checks to GitHub Actions emulators (which would run all PRs in parallel).

### 21–22 Nov — sleep, crashes and conflicts
- Phone builder stopped for good (owner: "the phone is a distraction"); everything on the emulator, owner previews deferred.
- 360 dp dropped (owner decision): Maestro at 320 and 375 only.
- What looked like emulator crashes and phone disconnects was mostly **the laptop sleeping** (18:00, 20:32 lid, 23:32 hibernate): ~5 h lost. Real emulator crashes (GPU, then window) fixed by running it headless with software graphics (`-no-window -gpu swiftshader_indirect`), at a high CPU cost.
- **Flow 04 merged (01:10)** after a CI failure: the generated types file had been formatted, and CI diffs it against raw `supabase gen types` output. Rule: commit it raw, regenerate after merging main.
- **Flow 09 merged (06:22)** after sitting ~3 h: once flow 04 merged, #14 conflicted with main and GitHub runs no CI on a conflicting PR. Rule: device builders first merge main into ready PRs that conflict.
- PC restarted (~10:05 local clock); Docker, emulator and loops restarted. 9 of 18 merged.

**Lessons:** on a laptop, power settings are part of the build system. A merge gate needs someone to watch for PRs that silently stop being mergeable.

### 22 Nov evening — speed-ups, then the weekly limit
- Owner: "apply all the things that can be done to save time". Added: Gradle build cache; a **prep builder** (`-Prep`) that keeps waiting PRs merged with main and green on the second database; **owner-tagged locks** that the loop clears after every run (dead runs had blocked the device for 30 min, 4–5 times); an **emulator watchdog**; and a **cloud device-check workflow** (`device-check.yml`, dispatched on main with the PR branch as input) so PRs can be checked in parallel on GitHub's emulators.
- First cloud run: build, emulator and tools worked; the app did not reach its sign-in screen in time (slow first start or a crash), so a second run collects a warm-up screenshot, logcat and Maestro debug output.
- **~19:20: the Claude account hit its weekly limit** (resets Tue 24 Nov, 18:00). The loop's stop check did not know the "weekly limit" wording and kept retrying; fixed. All builders, the emulator and the watchdog stopped until the reset or an account switch.

**Lesson:** budget the AI account like any other resource. Several Opus builders running day and night use a week's allowance in a few days; plan model mix (Sonnet for routine runs) and a second account before the crunch.

---

## 4. Lessons so far (for the guide)

1. **Specs and prototypes first.** Builders are only as good as the spec they read in one go.
2. **GitHub is the memory.** Branch + draft PR + Progress / Next step / Notes per flow; checkpoint after every step.
3. **Stop words and waits.** A headless loop needs to know "nothing to do", "waiting for CI", "usage limit", "offline".
4. **One owner per scarce resource** (phone, database), with locks that have a heartbeat.
5. **Humans judge quality.** Automated pixel checks are review aids; the owner says when a screen is wrong.
6. **Expect infrastructure trouble:** internet drops, OS restarts, low memory, phone lock screens. Each cost hours. Build the loop to resume on its own.
7. **Measure the bottleneck and move it.** It moved from writing code → CI → phone → database → phone time per flow.

---

## 5. Tutorial outline (draft)

1. Design the product as prototypes, with the owner
2. Write per-flow specs, rules and default answers
3. Screen tools: print, capture and compare prototype screens
4. Foundation: monorepo, CI, a free-plan merge gate
5. The builder prompt and the headless loop
6. Running several builders: lanes, clones, locks, heartbeats
7. Testing on a real phone: widths via density, MIUI quirks, dev vs release builds
8. Quality: owner review, "very, very good" bar, owner previews
9. Watching it remotely: phone notifications and a live checklist
10. When things break: outages, restarts, memory, contention (with the fixes above)
11. From merged flows to a store release

### 23 Nov: reboot overnight, and the last spec
- **15 of 18 merged.** Flows 15, 05 and 13 merged between 04:00 and 07:00.
- **The PC rebooted at 07:07** and took Docker, the emulator, both builders and the notifier with it. Recovery: start Docker, check both databases answer, save each clone's unfinished work (stash, plus a patch for a half-done merge), put the clones on main, clear locks whose owner is dead, restart the loops. Took about 10 minutes. **Lesson:** owner files on locks make it safe to tell a dead lock from a live one after a crash.
- **A cheaper model can be blocked by its habits.** The Sonnet prep builder reached for PowerShell where Opus used Bash, and the allowlist only had Bash. It spent about an hour reporting "blocked". **Lesson:** when swapping models, check the first few runs, not just the first one.
- **The cloud device check is paused.** It ran three times without a pass, and one hung for the full 150 minutes. **Lesson:** put a time limit on every step before the first run.
- **Flow 17 spec drafted.** Reading v25's real schema found conflicts the other specs had missed: part-paid books, bought credits sold at ₦3.33 to ₦5 against ₦3 now, and a 6-month plan with no match. They are owner decisions that block the production run. **Lesson:** read the old database before writing a migration spec; don't rely on notes about it.
- **Owner decision, same day: nothing is migrated from v25.** The first flow 17 draft was built around an importer. It was rewritten as launch only (whole-app check, production set-up, backups, beta, rollout), and the migration notes in other flows are void. **Lesson:** ask "is there anything to migrate?" before speccing a migration. One question would have saved the draft; the notes already said v25 was paused on 19 Nov.
- **Internet dropped seven times (07:40 to 16:20)** and each drop killed the run in progress. The loop now gives every run a session id and, after a drop, waits for the connection and resumes the same session with its locks kept. It carried flow 08 through three drops. **Lesson:** resume a lost session, don't restart the task.
- **Flow 08 merged at 17:33 and flow 16 at 18:01: 17 of 18.** The two loops then idled until 18:51, because neither was allowed to start a new flow. **Lesson:** when the queue empties, the loop should tell someone.
- **Flow 17 approved by the owner and started, split in two** so it runs in parallel: A (set-up, backups, release lanes, runbook; no device) and B (whole-app journeys on the emulator).
- **23 Nov, 22:30 to 23:45: the line stayed "up" but reset every request.** The loop's online check only opened a TCP connection, so it kept resuming into a dead line, used up its six resumes and threw away a four-hour session. Now it needs three real HTTPS answers in a row, allows 40 resumes, and can pick up an old session after the loop itself restarts. **Lesson:** check the thing you depend on (a full request), not a cheaper stand-in.
- **"Merged" was not "finished".** After 17 flows merged, the first rule-by-rule check of 4 flows found 82 gaps: jobs nobody runs, queues nobody reads, approval screens with no button, buying on Google Play still a placeholder. Each flow's own tests passed. Owner: fix all. **Lesson:** check the spec against the code per flow, before merging it, by someone who did not build it.

### 24 Nov: one build for testing, two Claude sessions on the same accounts, staging
- **Testing was the bottleneck**, so about 30 finished fixes were merged into one branch and one build instead of 30 builds. **Lesson:** when the queue waits on a device, batch what goes into each build.
- **Memory, not disk, was filling the disk.** 16 GB of RAM ran out, Windows grew the pagefile to 34 GB and the disk fell to 1.1 GB. A restart gave back about 20 GB. **Lesson:** check the pagefile before deleting caches.
- **Two sessions nearly did the same set-up twice.** One had been creating accounts in the browser, the other was building. They now share `docs/setup/ACCOUNTS.md` and a split: one does dashboards, one does code and deploys. Comparing the list with the code found placeholder addresses, and a production setting that pointed at v25's book bucket. **Lesson:** keep one list of what exists, and check the code against it.
- **Staging started.** All 48 migrations applied to the real staging database. The connection dropped after 17; running the same command again finished the rest. **Lesson:** make set-up safe to repeat. The Workers had to wait for a workers.dev address, which the account never had; once it existed both deployed first time.
- **Sample books on staging without seed accounts.** The local seed has a Super admin with a known password, so it never runs on a server on the internet. A separate tool adds books and authors nobody can sign in as. A throwaway reader then signed in, opened a book page and got the preview key only (1 of 8). **Lesson:** local seeds and staging content are different things.
- **First shareable build ("Arpedia Test", staging), same day.** Own app id and own signing key, so it installs beside v25. Before anyone opened it: checked the app id, the signature, that only staging addresses are inside, and that no saved secret is. The first emulator run crashed at once, because the APK was built for phone chips and the emulator has a PC chip; worse, the tester carried on in the other Arpedia app that came to the front. A matching emulator build then passed all 8 steps, and the ledger was exact (+300 +200 −30 = 470). **Lesson:** build for the device you test on, and check which app is in front before every step.
- **Deploying from a builder's folder went wrong.** The builder switched branches mid-deploy, so older code went up for a few minutes; the database refused its migration and nothing changed. **Lesson:** deploy from a copy nobody else uses.
- **Evening: the disk fell to 0.25 GB at 19:04** when all three builders ran at once. Pausing two and deleting only re-creatable folders (build output, `node_modules`) bought time. **Rule since then:** two builders at most while an app build is running.
- **Docker froze about 20:03** with under 1 GB of RAM free (likely related, not proven), and its restart command hung. The same Docker ran another project's containers, so nothing was forced: the tester pushed its work, released its locks and stopped, and the PC was restarted the next morning. The disk went back to 24.8 GB. **Lesson:** on a shared engine, checkpoint and stop before reaching for a force-kill.

### 25 Nov: accounts
- **Email, crash reporting accounts and DNS are set up** (Resend, Sentry), PostHog waits for a US or EU choice. The crash-reporting token made for CI can read releases but not the event counts the launch check needs. **Lesson:** test a new key against the exact call that will use it.

### 26 and 27 Nov: crashes, a 21-hour stall, and moving to the cloud
- **The PC shut down twice without warning** (25 Nov 08:27, 26 Nov 09:56), the second during an app build with 0.28 GB of RAM free. Builds now run Gradle with at most 2 workers (`GRADLE_OPTS=-Dorg.gradle.workers.max=2`, `CMAKE_BUILD_PARALLEL_LEVEL=2`). **Lesson:** cap a build's parallelism to the machine's memory, not its cores.
- **The tester sat stuck for 21 hours.** A Maestro run hung, then the internet dropped, and the only alert looked for "idle", not "no activity". A second alert now fires when a builder's session log hasn't changed in 45 minutes, and every build or test run has a hard limit (build 40 min, one flow 15 min). **Lesson:** watch for silence, not just for a finished state.
- **Code builders moved to the cloud** (scheduled cloud tasks on the repo): A1 (server, flows 00–08), A2 (server, 09–16) and C (app screens), each starting every hour. Only the emulator tester stays on the PC. It took the Claude GitHub App installed by the repo's owner account, not by a collaborator. About 30 fixes merged in the first three hours. **Lesson:** keep the one thing that needs hardware local and move everything else off the machine.
- **Parallel builders reused migration versions.** Two PRs merged minutes apart with the same timestamps and broke main's database job; a rename fixed it (nothing shared had applied them). Builders now name migrations to the second and check for clashes after rebasing. **Lesson:** anything numbered by hand clashes once work runs in parallel.
- **Overlapping runs duplicated work.** A manual start plus the scheduled start ran two copies of A1, which opened the same fixes twice. The duplicates were closed, and builders now check open branches and PRs before taking a row. **Lesson:** claim before you start, and don't trigger a run by hand right before its schedule.
- **The website was rebuilt in the monorepo** (`apps/web`) from the old site's words with the new brand, serving the legal pages the app and Google Play link to. One dark-mode contrast bug was caught by looking at the screenshots, not by any check. **Lesson:** look at every theme yourself before calling a page done.
