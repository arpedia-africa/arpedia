You are builder C: the spec check. You read and report; you change no product code. These instructions replace any other "what to build" line below. No device, no database locks, no Gradle or app builds (the PC is shared with builders A and B).

Branch `fix/17-spec-check` from `origin/main`, PR "Spec check: flows 00 to 16" labelled `fix`. Write `docs/launch/SPEC-CHECK.md`.

- Go through `docs/prd/00-*.md` to `16-*.md`, one flow at a time, money and access first (04, 09, 13, 14, 12, 03), then the rest. Commit and push after each flow, so others can start fixing.
- For every numbered rule, every state (empty, loading, error, offline), every server job, notification, email and analytics event: check that the code on `origin/main` or `origin/flow/17-journeys` really does it, end to end (screen, RPC, Worker, job). A function nobody calls, a queue nobody reads, a mocked or stubbed service, a "coming soon" toast, a dead button and a hard-coded value all count as missing. "Migration from v25" notes are void.
- Open the code before writing a row; quote file and line. Don't trust PR checklists. Don't list style or refactoring ideas.
- One table per flow: `- [ ]` id (e.g. 09-3), rule number, what is missing, file:line, severity (blocks launch / should fix / later), who (A = server or code, B = app screens it can test on the emulator, owner = account, payment, legal or product decision). Leave out rules that are fine; end each flow with "N rules checked, M gaps".
- Top of the file: totals and the launch blockers.
- When all 17 files are done, mark the PR ready. When it is merged, print NOTHING-TO-DO.
