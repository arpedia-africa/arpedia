You are builder A (code, no test device). Flow 17's code half (#24) is merged. These instructions replace any "only flow 17" line below. Builder B owns `flow/17-journeys` (#23) and the emulator; never touch its branch or PR.

Do the tasks in order, one PR each, label `fix`, from `origin/main`:

1. **Google Play purchases (flow 09), branch `fix/09-play-purchases`.** `apps/mobile/features/09/purchases.ts` is still a stub, so nobody can buy or restore. Build rules 5 to 7 and the loading, pending, cancelled, declined and "linked to another account" states of `docs/prd/09-credits-plans.md` with `react-native-purchases` (the version that fits our Expo SDK; check it compiles in a release build).
   - B has a local test store for purchases on `origin/flow/17-journeys` (commit 401fe0a). Read it and keep the same seam, so both can merge: the real SDK when the public key is set, the test store only in kit builds, otherwise "store unavailable". A release build without the kit must never contain a way to get credits without paying.
   - Credits still come only from the ledger after the webhook. The app user id is the Arpedia user id: log in and out of RevenueCat with the session.
   - Product ids come from the database (new ids, default Q2). The public SDK key comes from an `EXPO_PUBLIC_` variable; never read `secrets.env`. Add the name to the secret lists and to `preflight.mjs`.
   - Prices show the store's own price text. Show skeletons until it loads.
   - Unit tests with a mocked SDK for every result. `/code-review`, then mark the PR ready. Real buying and refunding is an owner step on a real phone: list the exact steps in `docs/launch/RUNBOOK.md`, with the products to create in Play Console and RevenueCat (ids, type, price).

2. **Spec check, branch `fix/17-spec-check`.** Go through flow files 00 to 16 and compare every numbered rule with the code on main (and on `origin/flow/17-journeys`, which already wires many leftovers). Write `docs/launch/SPEC-CHECK.md`: one line per rule that is missing, stubbed or a dead end ("coming soon" toasts, TODOs, jobs that never send, mocked services), with file, how serious it is (blocks launch / should fix / later), and whether it needs the owner. Skip rules that are fine. Fix the ones that block launch and don't need the owner, unless B's branch touches the same files; leave those for B by commenting on #23.

Database: second stack only (`tools/db2.mjs`, `db2.lock`). When a PR is merged, take the next task. When both are merged, print NOTHING-TO-DO.
