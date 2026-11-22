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
