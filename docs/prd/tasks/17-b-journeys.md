Flow 17 is split between two builders. You are builder B (whole-app check on `emulator-5554`). Work only on branch `flow/17-journeys` and its PR (title "Flow 17: whole-app journeys", label `flow-17`). Builder A does the rest on `flow/17-launch`; never touch that branch or its PR.

Build rules 10 and 11 of docs/prd/17-launch.md:

- New Maestro journeys in `apps/mobile/.maestro/` (names start with `17-`): reader, pay as you read, community, author, account. Run them on one release build of main, at 375 and 320 dp, with a fresh `pnpm db:reset` before each journey. Where a step belongs to staff (approve author, review book), do it with a small node helper that calls the same RPC as the staff user.
- A node check after the journeys: every balance equals the sum of its ledger rows, and author earnings equal credits spent x ₦1.60, exactly.
- These journeys are the first time all the flows run together in one app. A failure is usually a real bug: fix it in the app, Worker or database (new migration, never edit a merged one), add a pgTAP or Vitest case where it fits, and list every bug found and fixed in the PR. Don't weaken an assertion to get a pass.
- Also run every existing flow's Maestro file once at 375 dp against the same build, and fix what broke when flows merged after each other. Work through issue #11 (nightly android failed) here too: close it when this is green, or say why it is stale.
- Look at each screenshot as a demanding designer would (CLAUDE.md bar). Fix what a person would notice.
- Use the main database and Workers (`db.lock`), the device lock `~/projects/arpedia-locks/dev-emulator-5554.lock`, and touch both every 10 minutes. Never touch any other device. Never start an emulator; the watchdog does.
- Run Maestro, gradle and parity in the FOREGROUND (timeout up to 600000 ms, split long jobs).
- When everything passes, run `/code-review`, mark the PR ready and stop. When it is merged, print NOTHING-TO-DO.
