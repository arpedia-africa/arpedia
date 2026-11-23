You are builder A (code, no test device). Flow 17's code half (#24) is merged. These instructions replace any "only flow 17" line below. Builder B owns `flow/17-journeys` (#23) and the emulator; never touch its branch or PR.

Do the tasks in order, one PR each, label `fix`, from `origin/main`:

1. **Google Play purchases (flow 09), branch `fix/09-play-purchases`.** `apps/mobile/features/09/purchases.ts` is still a stub, so nobody can buy or restore. Build rules 5 to 7 and the loading, pending, cancelled, declined and "linked to another account" states of `docs/prd/09-credits-plans.md` with `react-native-purchases` (the version that fits our Expo SDK; check it compiles in a release build).
   - B has a local test store for purchases on `origin/flow/17-journeys` (commit 401fe0a). Read it and keep the same seam, so both can merge: the real SDK when the public key is set, the test store only in kit builds, otherwise "store unavailable". A release build without the kit must never contain a way to get credits without paying.
   - Credits still come only from the ledger after the webhook. The app user id is the Arpedia user id: log in and out of RevenueCat with the session.
   - Product ids come from the database (new ids, default Q2). The public SDK key comes from an `EXPO_PUBLIC_` variable; never read `secrets.env`. Add the name to the secret lists and to `preflight.mjs`.
   - Prices show the store's own price text. Show skeletons until it loads.
   - Unit tests with a mocked SDK for every result. `/code-review`, then mark the PR ready. Real buying and refunding is an owner step on a real phone: list the exact steps in `docs/launch/RUNBOOK.md`, with the products to create in Play Console and RevenueCat (ids, type, price).

2. **Fix everything in the spec check (owner: "please fix all", 23 Nov).** Builder C writes `docs/launch/SPEC-CHECK.md` (branch `fix/17-spec-check`, then main). Fix every row that isn't marked "owner" and isn't assigned to B: launch blockers first, then "should fix", then "later". Group rows by flow, one branch and PR per group (`fix/NN-<topic>`, label `fix`), each small enough to merge the same day, with tests. Tick the row in SPEC-CHECK.md in the same PR. If a row turns out to be wrong, say why in the row instead of fixing it.
   - Order for the blockers: (1) privacy and security: 01-2, 07-2, 14-6, 14-8, 10-1; (2) **one notification and email dispatcher** that reads every queue nobody reads (`user_notify`, `author_notify`, `book_notify`, `trust_notify`), respects `notification_allowed`, sends push, bell and email, and runs on the Worker cron: this closes 09-2, 10-3, 11-1, 12-2, 13-1, 14-1, 14-2 and 15-1 to 15-4, 15-6 together; (3) the rest.
   - Builder C fixes the rows marked B; B tests. Don't take B rows.
   - Work that needs a phone to verify: build it, test what you can, and add a line to #23 so B checks it on the emulator. Don't mark a visible app change ready until B has confirmed it there (or B takes the PR over with the label `needs-phone`).
   - A row that would change a price, a money rule or who can see private data is the owner's: leave it and list it.
   - Never edit a merged migration.

Database: second stack only (`tools/db2.mjs`, `db2.lock`). When a PR is merged, take the next task. When every row is done, print NOTHING-TO-DO.
