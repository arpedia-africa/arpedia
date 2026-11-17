# Cloud build loop

The build runs in the cloud, unattended. Builders work through [BUILD-PLAN.md](BUILD-PLAN.md) using the queue in [status.json](status.json), and your computer can be off. They can run from **one Claude account or several** (one lane per account).

## How it works
```
GitHub repo arpedia-africa/arpedia (private) ── main is protected: merges only when every gate is green
   │
   ├─ L1 builder: critical path (Opus)   ─ owner account-A ┐  Claude Code cloud routines,
   ├─ L2 builder: product screens (Sonnet) ─ owner account-B ├  each wakes every 2 hours
   ├─ L3 builder: money and ops (Opus)   ─ owner account-C ┘  (all three can be one account)
   ├─ Fix routine (Sonnet)               ─ owner account-A, every 4 hours
   │
   └─ GitHub Actions CI: typecheck, lint, Vitest, pgTAP, Android emulator
      (Maestro e2e and screenshots), visual-parity artifacts
```

## Live state comes from GitHub, not from a file
`status.json` is a **static** queue: lanes, owners, dependencies and the questions each flow needs. **Builders never edit it**, so parallel lanes never conflict over it. Each flow's live state is read from GitHub:

| State | How a builder tells |
|---|---|
| **Claimed** (someone is building it) | Branch `flow/NN-*` exists on origin, **or** an open PR labelled `flow-NN` |
| **Merged** (done) | A merged PR labelled `flow-NN` |
| **Ready to start** | Not claimed, every dependency merged, every question in `answeredQuestions` or `acceptDefaultsFor` |

Only the coordinator (you plus Claude in a normal session) edits `status.json`: owners, `answeredQuestions` and `acceptDefaultsFor`.

## Claiming a flow (prevents two builders doing the same work)
1. `git fetch origin`. Re-check that the flow is unclaimed.
2. Create the branch from `main` and **push it immediately**, empty: `git push origin flow/NN-name`.
   - **If the push is rejected because the branch already exists:** another builder claimed it. Stop.
3. Open a **draft PR** at once: title `Flow NN: <name>`, label `flow-NN`, body "Claimed by <lane> (<owner>)".
4. Only then start building.

## Each wake: exactly one of these, in order
1. **Your lane has an open PR with failing CI or review findings:** fix them, push, stop.
2. **Your lane has an open PR that is green:** mark it ready for review, enable auto-merge, stop.
3. **Your lane has no open PR:** take the first ready flow **in your own lane**. Claim it (above), build it with the kickoff prompt from BUILD-PLAN.md, run the gates you can, push, mark the PR ready, enable auto-merge, stop.
4. **Nothing is ready** (dependencies not merged, questions unanswered): add one short comment to the **"Build status"** issue saying what you're waiting for, and stop.

**Every builder:**
- **Reads only:** `CLAUDE.md`, `status.json`, its flow file, and the Data and Server sections of its dependencies.
- **Never:**
  - touches another lane's branch
  - edits `status.json`
  - merges by hand
  - weakens a gate
  - reads secrets
- **Reports in 10 lines or fewer.**

**The fix routine** (one per project, run by account-A) picks up issues labelled `fix`, from your phone checks, and fixes each on a small PR labelled `fix`.

## Running on several Claude accounts
Allowed when **each account belongs to a real team member** (their own seat, or a Team plan). Don't create or share accounts to get around usage limits.

**For each account:**
1. **GitHub access:** add that person's GitHub user as a collaborator on `arpedia-africa/arpedia` (repo → Settings → Collaborators → Write). Using the `arpedia-africa` login itself also works.
2. **Claude GitHub app:** installed once on `arpedia-africa` for the `arpedia` repo; it's shared by all accounts. Each person signs in to **claude.ai/code** with their own Claude account and checks the repo appears.
3. **Create the routine:** they open Claude Code signed in to **their** account, in this repo, run `/schedule`, and paste **their lane's prompt** (below). Every 2 hours. Opus for L1 and L3, Sonnet for L2.
4. **Record it:** the coordinator writes who owns which lane in `status.json` → `accounts` and `lanes.*.owner`.

**Fewer accounts than lanes?** One account can run several lanes. Create one routine per lane, all in that account.

**Secrets** live on the repo (GitHub Actions secrets), so every lane uses the same staging keys. No account needs the secrets file.

## Lane prompts (paste into `/schedule`)
**L1 (critical path, Opus, every 2 hours):**
```
You are the Arpedia cloud builder for lane L1-critical (owner account-A).
Repo: arpedia-africa/arpedia. Follow docs/prd/CLOUD-RUN.md exactly: read CLAUDE.md and
docs/prd/status.json, determine live state from GitHub branches and PRs labelled flow-NN,
then do exactly ONE action from "Each wake". Only take flows listed in lanes.L1-critical.
Claim before building (push the empty branch, open a draft PR labelled flow-NN). Build with
the kickoff prompt in docs/prd/BUILD-PLAN.md. Never edit status.json, never touch other lanes'
branches, never merge by hand, never weaken gates, never read secrets. Report in 10 lines.
```
**L2 (product screens, Sonnet, every 2 hours):** the same prompt with `lane L2-product (owner account-B)` and `lanes.L2-product`.

**L3 (money and ops, Opus, every 2 hours):** the same prompt with `lane L3-money-ops (owner account-C)` and `lanes.L3-money-ops`.

**Fix (Sonnet, every 4 hours, account-A):**
```
You are the Arpedia fix builder. Repo: arpedia-africa/arpedia. Read CLAUDE.md. Take the oldest
open issue labelled "fix" that has no open PR linked. Fix it on branch fix/<issue-number>, open a PR
labelled fix that closes the issue, enable auto-merge, stop. If none, stop. Report in 5 lines.
```

## What you do
| When | What |
|---|---|
| Once | Finish the account setup ([../setup/SETUP-GUIDE.md](../setup/SETUP-GUIDE.md)), then copy the secrets to GitHub (Part 15) |
| Before each wave | Answer or accept defaults for the questions it needs (in chat or in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)). The coordinator records them in `status.json` |
| When flows merge | Install the internal build on your phone, check the flow, and open an issue labelled `fix` for anything wrong (a screenshot is enough) |
| Any time | Watch the **"Build status"** issue and the PR list |

## What the cloud can't do (and who does it instead)
- **Real phone check:** you, once per flow.
- **Emulator runs:** GitHub Actions does them (the cloud sandbox has no Android emulator). Builders read the CI results and screenshot artifacts.
- **Payments, identity checks, store listing:** you, via [SETUP-GUIDE.md](../setup/SETUP-GUIDE.md) and in flow 17.
- **Secrets:** stored in GitHub Actions secrets and Cloudflare. Builders never see production keys; cloud runs use staging only.

## Guardrails
- **Branch protection on `main`:** all gates required, no force-push, linear history.
- **Auto-merge** only when CI and the visual-parity review pass.
- **Production deploys** only from tagged releases, which you trigger. Builders deploy to staging only.
- **Labels** `flow-00` … `flow-17` and `fix` exist on the repo (the coordinator creates them).
- **Cost:** a wake with nothing to do ends in under a minute. A building wake is one flow session. About 26 building sessions in total, plus small fix runs, split across however many accounts run lanes.

## Setup steps (coordinator)
1. ✅ Create the private repo `arpedia-africa/arpedia` and push.
2. ✅ Labels `flow-00` … `flow-17` and `fix` created; **"Build status"** is issue #1.
3. Copy the staging secrets to GitHub Actions (SETUP-GUIDE Part 15).
4. Fill in `accounts` and lane owners in `status.json`. Record which W1 and W2 questions are answered or defaulted.
5. Each owner creates their routine(s) with the prompts above. **L1 runs first and builds flow 00**, which includes CI and branch protection. L2 and L3 find nothing ready until 00 merges, so they stop quickly.
