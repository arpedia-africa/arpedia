# Cloud build loop

The build runs in the cloud, unattended, working through [BUILD-PLAN.md](BUILD-PLAN.md) using the queue in [status.json](status.json). Your computer can be off.

## How it works
```
GitHub repo (private) ─── main is protected: merges only when every gate is green
   │
   ├─ Lane agent L1 (critical path, Opus)    ┐ Claude Code cloud routines,
   ├─ Lane agent L2 (product screens, Sonnet)├ each wakes every 2 hours
   ├─ Lane agent L3 (money and ops, Opus)    ┘
   │
   └─ GitHub Actions CI: typecheck, lint, Vitest, pgTAP, Android emulator
      (Maestro e2e and screenshots), visual-parity artifacts
```

**On each wake, a lane agent does exactly one of these, in order:**
1. **Its open PR has failing CI or review findings:** fix them, push, stop.
2. **Its open PR is green:** request merge (auto-merge is on), stop.
3. **No open PR:** pick the next flow in its lane that is `todo`, whose dependencies are `merged` and whose blocking questions are answered or defaulted.
   1. Create its branch.
   2. Build it with the kickoff prompt from BUILD-PLAN.md.
   3. Run the gates it can run in the cloud.
   4. Push, open a PR with auto-merge, set the flow to `pr-open`, stop.
4. **Nothing is ready** (dependencies not merged, or questions unanswered): stop and leave a short note on the tracking issue.

Every lane agent:
- **reads:** `CLAUDE.md`, `status.json`, its flow file, and the Data/Server sections of its dependencies
- **never touches** another lane's branch
- **never merges by hand**
- **never weakens a gate**

**A fix routine** runs every 4 hours. It picks up GitHub issues labelled `fix` (from your phone checks) and fixes them on small PRs with Sonnet.

## What you do
| When | What |
|---|---|
| Once, now | Set up accounts ([../setup/SETUP-GUIDE.md](../setup/SETUP-GUIDE.md)) and approve creating the GitHub repo |
| Before each wave | Answer or accept defaults for the questions it needs. Reply in chat or edit [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md). The coordinator records them in `status.json` (`answeredQuestions` / `acceptDefaultsFor`) |
| When flows merge | Install the internal build on your phone, check the flow, and open an issue labelled `fix` for anything wrong (a screenshot is enough) |
| Any time | Watch progress on the tracking issue "Build status" and in the PR list |

## What the cloud can't do (and who does it instead)
- **Real phone check:** you, once per flow.
- **Emulator runs:** GitHub Actions does them (the cloud sandbox has no Android emulator). Agents read the CI results and the screenshot artifacts.
- **Payments, identity checks, store listing:** you, via [SETUP-GUIDE.md](../setup/SETUP-GUIDE.md) and in flow 17.
- **Secrets:** stored in GitHub Actions secrets and Cloudflare. Agents never see production keys. Cloud runs use staging only.

## Guardrails
- **Branch protection on `main`:** all gates required, no force-push, linear history.
- **Auto-merge** only when CI and the visual-parity review pass.
- **Production deploys** only from tagged releases, which you trigger. Lane agents deploy to staging only.
- **Cost:** each wake that has nothing to do ends in under a minute. A building wake is one flow session. Expect about 26 building sessions in total plus small fix runs.

## Setup steps (coordinator, after accounts)
1. Initialise git, commit, create the private repo `arpedia-africa/arpedia` under the new arpedia-africa GitHub account's organisation, and push. *(needs your OK, after `gh` is signed in to that account)*
2. Add the GitHub Actions secrets from the vault (staging only).
3. Lane L1 builds flow 00, including CI and branch protection. It can run as the first cloud routine run, or locally.
4. Create the four routines with `/schedule`: L1, L2, L3 every 2 hours, fix every 4 hours. Create the "Build status" tracking issue.
5. Answer the W2 questions (Q88–92, Q47–52). Lanes L1 and L2 start flows 12 and 01 on their next wake.
