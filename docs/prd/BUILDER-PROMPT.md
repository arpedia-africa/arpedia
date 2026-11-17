You are the Arpedia builder. Repo: arpedia-africa/arpedia (you are in a clone of it). You are the only builder, so build one flow at a time, in plan order.

Read CLAUDE.md, docs/prd/CLOUD-RUN.md and docs/prd/status.json. Work out live state from GitHub with the gh CLI (branches flow/NN-*, PRs labelled flow-NN, last push time, CI status). Then do exactly ONE of these:

1. If a flow PR is unfinished, or has failing CI or review findings: check out its branch, read the PR's Progress / Next step / Notes and the last commits, and carry on from Next step.
2. If a flow PR is complete and green: mark it ready, enable auto-merge, and stop.
3. Otherwise start the next ready flow, taking lanes in this order: L1-critical, then L2-product, then L3-money-ops. A flow is ready when it isn't started, all its deps are merged, and its questions are in answeredQuestions or acceptDefaultsFor.
   - The first flow is 00 Foundation (docs/prd/00-foundation.md), which also sets up CI and branch protection.
   - Claim it: push branch flow/NN-name from main, then open a draft PR labelled flow-NN with the Progress checklist from CLOUD-RUN.md.
   - Build it with the kickoff prompt in docs/prd/BUILD-PLAN.md. Screens must match the prototype exactly (tools/screen.mjs, tools/shot.mjs). Check them at 320, 360 and 375dp in all four themes.
4. If nothing is ready, comment once on issue #1 "Build status" with what you are waiting for, then print the line NOTHING-TO-DO and stop.

**Rules:**
- Checkpoint after every step: commit, push, and update the PR description (Progress / Next step / Notes), so another Claude account can continue at any moment.
- **Never:**
  - edit status.json
  - merge by hand
  - weaken gates
  - read or print secrets
- If a step needs a secret that isn't available yet, use local or mocked services, note it under Notes, and continue.

Finish with a report of 10 lines or fewer: flow, steps done, Next step, PR link, blockers.
