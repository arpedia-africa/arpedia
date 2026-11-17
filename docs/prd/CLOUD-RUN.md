# Cloud build loop

The build runs in the cloud, unattended, working through [BUILD-PLAN.md](BUILD-PLAN.md) using the queue in [status.json](status.json). **Any Claude account on the team can carry the work on.** When one account reaches its usage limit, a teammate's account picks up exactly where it stopped, because every bit of progress lives on GitHub, never in a session.

## How it works
```
GitHub repo arpedia-africa/arpedia (private) ── the single source of truth
   │  branches flow/NN-* · PRs labelled flow-NN · a Progress checklist in each PR
   │
   ├─ Builder runs on account A ─┐
   ├─ Builder runs on account B ─┼─ same prompt, any account, any time.
   └─ Builder runs on account C ─┘  Whoever wakes next continues the work.
   │
   └─ GitHub Actions CI: typecheck, lint, Vitest, pgTAP, Android emulator,
      visual-parity artifacts. main merges only when every gate is green.
```

## The handoff rules (what makes switching accounts safe)
1. **Commit and push at every checkpoint.** A flow is built in small steps; after each one the builder commits, pushes and ticks the step in the PR's **Progress** checklist:
   1. claim
   2. migration and RLS
   3. Workers
   4. app screens
   5. admin screens
   6. tests
   7. visual parity
   8. review fixes

   If an account runs out mid-flow, at most one step is lost.
2. **The PR description is the handoff note.** It holds:
   - the Progress checklist
   - **Next step:** one line saying exactly what to do next
   - **Notes:** decisions taken, defaults used, anything half-done, with file paths

   The builder updates it at every checkpoint, before doing anything else.
3. **Work in progress is pushed even if it doesn't compile yet.** The commit message starts with `wip(NN):`. Only the final state needs green gates.
4. **Stalled work is continued, not skipped.** If an in-progress PR has had no push for **3 hours** (`stallHours`), the account that ran it has probably stopped. Any builder on any account continues it on the same branch.
5. **Nothing lives only in a session.** No local-only files, no "I'll remember". If it isn't pushed, it didn't happen.

## Live state comes from GitHub
`status.json` is a **static** queue: lanes, dependencies and the questions each flow needs. Builders never edit it.

| State | How a builder tells |
|---|---|
| **In progress** | Branch `flow/NN-*` or an open PR labelled `flow-NN`, pushed to within the last 3 hours |
| **Stalled** | Same, but no push for over 3 hours → **continue it** |
| **Merged** | PR labelled `flow-NN` merged into `main` |
| **Ready to start** | Not started, every dependency merged, every question in `answeredQuestions` or `acceptDefaultsFor` |

**Lanes** (L1 critical, L2 product, L3 money and ops) only keep parallel work apart, so that at most three flows run at once. They aren't tied to accounts; any account can run any lane.

## Each wake: exactly one of these, in order
1. **Continue unfinished work first.** If any open `flow-NN` PR in your lane is stalled, or has failing CI or review findings:
   1. check out its branch
   2. read the PR description (Progress, Next step, Notes) and the last commits
   3. carry on from **Next step**, checkpointing as above
2. **Finish green work.** If a PR in your lane is complete and green: mark it ready, enable auto-merge, stop.
3. **Start new work.** Otherwise take the first ready flow in your lane:
   1. **Claim it:** `git fetch`, create `flow/NN-name` from `main`, push it immediately. **If the branch already exists, someone has it; stop.**
   2. Open a **draft PR** labelled `flow-NN` with the Progress checklist.
   3. Build it with the kickoff prompt from BUILD-PLAN.md, checkpointing as you go.
4. **Nothing to do:** add one short comment to the **"Build status"** issue (#1) saying what you're waiting for, and stop.

**Every builder:**
- **Reads only:** `CLAUDE.md`, `status.json`, its flow file, and the Data and Server sections of its dependencies.
- **Never:**
  - edits `status.json`
  - merges by hand
  - weakens a gate
  - reads secrets
- **Reports in 10 lines or fewer.**

**PR description template** (the builder creates it when claiming):
```
## Progress
- [x] claim
- [ ] migration + RLS
- [ ] workers
- [ ] app screens
- [ ] admin screens
- [ ] tests
- [ ] visual parity (320/360/375, 4 themes)
- [ ] review fixes
**Next step:** write supabase/migrations/…_flow03_unlock.sql (entitlements, spend RPC)
## Notes
- Used default for Q62 (finishers only can review)
```

## Running it locally with the Claude CLI (current setup)
One builder runs on this computer with a script, instead of cloud schedules. It follows the same rules and the same GitHub handoff.
```powershell
powershell -ExecutionPolicy Bypass -File tools\build-loop.ps1
```
- **Clone:** it works in its own clone, `C:\Users\PC\projects\arpedia-builder`, so your working copy is never touched.
- **Prompt:** each run uses [BUILDER-PROMPT.md](BUILDER-PROMPT.md). A run continues unfinished work or starts the next ready flow, checkpointing to GitHub.
- **Nothing to do:** it waits 15 minutes and checks again. Stop it any time with Ctrl+C.
- **When the Claude account hits its limit:** the script stops and says so. Run `claude /login` with a teammate's account, start the script again, and it continues from the PR's Next step.
- **Options:** `-Model claude-sonnet-5-5` for cheaper screen work, `-IdleMinutes 20`.

## Switching accounts: two ways
**A. Automatic.** Each account that should take part creates the **same routines** with `/schedule`:
- the three lane prompts, every 2 hours (stagger them by an hour across accounts)
- the fix prompt, every 4 hours

When account A runs out, its routines simply stop running, and account B's next wake finds A's stalled PR and continues it.

**B. By hand.** When an account runs out mid-session, open Claude Code on a teammate's account in this repo and paste:
```
Continue the Arpedia build. Follow docs/prd/CLOUD-RUN.md: find open PRs labelled flow-NN,
read each PR's Progress / Next step / Notes, check out the branch and carry on from Next step.
Checkpoint after every step (commit, push, update the PR description). If nothing is open,
start the next ready flow in lane L1-critical.
```

**For any account to take part:**
1. That person's GitHub user is a collaborator on `arpedia-africa/arpedia` (Settings → Collaborators → Write), or they use the `arpedia-africa` login.
2. The Claude GitHub app is installed on `arpedia-africa` for `arpedia`, once; it's shared by everyone.
3. They sign in to **claude.ai/code** with their own Claude account and check the repo appears.

Secrets live on the repo (GitHub Actions secrets), so no account needs the secrets file. Each account should belong to a real teammate (their own seat or a Team plan).

## Lane prompts (paste into `/schedule`, same on every account)
**L1 (Opus, every 2 hours):**
```
You are an Arpedia cloud builder for lane L1-critical. Repo: arpedia-africa/arpedia.
Follow docs/prd/CLOUD-RUN.md exactly. Read CLAUDE.md and docs/prd/status.json, work out
live state from GitHub (branches, PRs labelled flow-NN, last push time), then do exactly ONE
action from "Each wake", always continuing stalled or failing work in your lane first.
Only take flows listed in lanes.L1-critical. Checkpoint after every step: commit, push, update
the PR's Progress / Next step / Notes. Never edit status.json, never merge by hand, never weaken
gates, never read secrets. Report in 10 lines.
```
- **L2 (Sonnet, every 2 hours):** the same, with `lane L2-product` and `lanes.L2-product`.
- **L3 (Opus, every 2 hours):** the same, with `lane L3-money-ops` and `lanes.L3-money-ops`.

**Fix (Sonnet, every 4 hours):**
```
You are the Arpedia fix builder. Repo: arpedia-africa/arpedia. Read CLAUDE.md. Take the oldest
open issue labelled "fix" with no open PR. Fix it on branch fix/<issue-number>, open a PR labelled
fix that closes the issue, enable auto-merge, stop. If none, stop. Report in 5 lines.
```

## What you do
| When | What |
|---|---|
| Once | Finish the account setup ([../setup/SETUP-GUIDE.md](../setup/SETUP-GUIDE.md)), then copy the secrets to GitHub (Part 15) |
| When an account runs out | Nothing, if other accounts have routines. Otherwise paste the "Continue" prompt in a teammate's account |
| Before each wave | Answer or accept defaults for the questions it needs. The coordinator records them in `status.json` |
| When flows merge | Check the flow on your phone; open an issue labelled `fix` for anything wrong |
| Any time | Watch the **"Build status"** issue (#1) and the PR list |

## What the cloud can't do (and who does it instead)
- **Real phone check:** you, once per flow.
- **Emulator runs:** GitHub Actions does them. Builders read the CI results and screenshot artifacts.
- **Payments, identity checks, store listing:** you, via [SETUP-GUIDE.md](../setup/SETUP-GUIDE.md) and in flow 17.
- **Secrets:** in GitHub Actions secrets and Cloudflare. Builders use staging only.

## Guardrails
- **Branch protection on `main`:** all gates required, no force-push, linear history. Work-in-progress commits are squashed on merge.
- **Auto-merge** only when CI and the visual-parity review pass.
- **Production deploys** only from tagged releases, which you trigger.
- **Cost:** a wake with nothing to do ends in under a minute. About 26 building sessions in total, spread across whichever accounts are active.

## Setup steps (coordinator)
1. ✅ Private repo `arpedia-africa/arpedia` created and pushed.
2. ✅ Labels `flow-00` … `flow-17` and `fix` created; **"Build status"** is issue #1.
3. Copy the staging secrets to GitHub Actions (SETUP-GUIDE Part 15). Not needed for flow 00.
4. Record which W1 and W2 questions are answered or defaulted in `status.json`.
5. On the first account, create the L1 routine (and L2, L3 and fix). L1 builds flow 00 first; the others stop quickly until it merges. Add the same routines on teammates' accounts whenever they join.
