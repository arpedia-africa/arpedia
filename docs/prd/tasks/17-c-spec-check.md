You are builder C: the spec check. You read and report; you change no product code. These instructions replace any other "what to build" line below. No device, no database locks, no Gradle or app builds (the PC is shared with builders A and B).

Branch `fix/17-spec-check` from `origin/main`, PR "Spec check: flows 00 to 16" labelled `fix`. Write `docs/launch/SPEC-CHECK.md`.

- Go through `docs/prd/00-*.md` to `16-*.md`, one flow at a time, money and access first (04, 09, 13, 14, 12, 03), then the rest. Commit and push after each flow, so others can start fixing.
- For every numbered rule, every state (empty, loading, error, offline), every server job, notification, email and analytics event: check that the code on `origin/main` or `origin/flow/17-journeys` really does it, end to end (screen, RPC, Worker, job). A function nobody calls, a queue nobody reads, a mocked or stubbed service, a "coming soon" toast, a dead button and a hard-coded value all count as missing. "Migration from v25" notes are void.
- Open the code before writing a row; quote file and line. Don't trust PR checklists. Don't list style or refactoring ideas.
- One table per flow: `- [ ]` id (e.g. 09-3), rule number, what is missing, file:line, severity (blocks launch / should fix / later), who (A = server or code, B = app screens it can test on the emulator, owner = account, payment, legal or product decision). Leave out rules that are fine; end each flow with "N rules checked, M gaps".
- Top of the file: totals and the launch blockers.
- When all 17 files are done: write the totals and the launch blockers (one line each) at the top, spot-check every launch blocker once more in the code, drop any that are wrong, and mark the PR ready.

**After that PR is ready, you become an app builder** (the "no product code" rule above ends there). Fix the rows marked **B** in `docs/launch/SPEC-CHECK.md`: launch blockers first, then "should fix", then "later", grouped by flow, one `fix/NN-<topic>` branch and PR per group (label `fix`), each small enough to merge the same day.
- First check `origin/flow/17-journeys` (#23): builder B has already wired some of these there. Don't redo them, and don't edit the same lines.
- Claim a group by pushing its branch before you start. Builder A takes the rows marked A; B tests on the emulator.
- Screens follow CLAUDE.md (prototype, tokens, four themes, 320 and 375, every state).
- You have no device: typecheck, lint, format and Vitest only, plus pgTAP on the second database (`db2.lock`, shared with A; hold it briefly). No Gradle or app builds. When the code is done, label the PR `needs-phone` with a short list of what B must check, and take the next group. B checks it and marks it ready.
- Tick the rows in SPEC-CHECK.md in the same PR. When no B row is left, print NOTHING-TO-DO.
- **First job now (24 Nov): the batch.** Testing is the bottleneck, so make it one build. Create `fix/app-batch-1` from `origin/main`, merge `origin/flow/17-journeys` and every open `needs-phone` PR branch (oldest first, launch blockers included, #26 and #28 too), resolve conflicts by keeping both behaviours, and run typecheck, lint, format, Vitest and pgTAP (second database). Open PR "App fixes batch 1" (draft, labels `fix` and `needs-phone`) whose description lists every included PR with its check points grouped by screen, launch blockers first. Leave the single PRs open but remove their `needs-phone` label, with a one-line comment pointing to the batch. Keep it merged with main daily. When the batch merges, close the included PRs. Put new B groups into `fix/app-batch-2` directly: one commit per group, no PR per group.
- Rows you skipped because an open PR edits the same code can be done now, on top of the batch.
- Never drop a launch-blocker fix to get a merge through; if two PRs truly contradict each other, keep the one the flow file asks for and say so in the PR.
