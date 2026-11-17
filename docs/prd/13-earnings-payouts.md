# Flow 13 · Author earnings and payouts

**Build order:** 9 · **Depends on:** flow 9 (credit ledger), flow 11 (author profiles, payout account screen) · **Prototype:** app screens `s-studio-royalties`, `s-studio-payout` (owned by flow 11, behaviour defined here); admin screens `s-royalties`, `s-royalty-cycle`, `s-royalty-release`, `s-royalty-settings`, `s-payouts`, `s-payout-retry`, `s-bank-accounts`, `s-bank-account`, `s-author-payout`

## Goal
Every month authors are paid exactly ₦1.60 for each credit readers spent on their books, tips and messages, with every naira traceable to ledger rows. Staff close the month, review exceptions, and release payments by Flutterwave transfer, with two people approving.

**Success looks like:** 98% of payable authors paid on the payout day; zero payouts that differ from the ledger recheck; failed transfers resolved within 3 working days.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Earnings (author) | `s-studio-royalties` | Month earnings, split by upfront and pay as you read, history |
| Payout account (author) | `s-studio-payout` | Bank, verified name, payout day, minimum, change account |
| Author earnings (admin) | `s-royalties` | One row per month; the month ready to release on top |
| Month detail | `s-royalty-cycle` | Earnings by author, calculation, checks, what was not paid, release |
| Release | `s-royalty-release` | Confirm overlay: amount, held, sent now, balance, 2-step code |
| Earnings settings | `s-royalty-settings` | Hold days, minimum payout, payout day, exclusions (author rate read-only) |
| Payouts | `s-payouts` | Every transfer with status and failure reason |
| Retry | `s-payout-retry` | Overlay to retry a failed transfer safely |
| Bank accounts, review | `s-bank-accounts`, `s-bank-account` | Verification queue and decision |
| Author payout account | `s-author-payout` | One author's bank, history, statements, hold |

## Behaviour
**What authors earn**
1. Author earnings = credits spent on the author's books, tips and messages × the **author rate** (₦1.60). The rate is set in Pricing rules (flow 9) and read-only here.
2. Each ledger spend row stores `author_id`, `author_earning_kobo` (credits × rate in kobo) and `rate_version` at the moment of spending. A rate change affects only credits spent after it takes effect; closed and paid months never change.
3. Upfront unlocks earn the whole price at once. Pay as you read earns per chapter charge, so a reader who stops halfway earns half. The total never exceeds the upfront price. Same as the flow 9 and flow 3 rules.
4. Not paid, and removed before a month closes: chapter charges undone by the reader within 10 minutes; chapters returned by Support; unspent credits taken back by a refund (spent credits stay paid); credits in a frozen gift loop; the author's own reading (self-reads never earn; the unlock RPC blocks authors from buying their own books, and any that slip through are excluded).
5. A book taken down after a copyright claim is upheld has its earnings frozen from the takedown date; held until Finance decides (open question 6).
6. Suspending author rights holds the open month's earnings; they are paid if the author is reinstated.

**Monthly cycle**
7. Months run 1st 00:00 to last day 23:59:59 WAT. A cycle has stages: **Adding up** (current month) → **Closed** (1st of next month, 00:05 WAT) → **Prepared** (one finance person prepares) → **Approved and released** (a second person, a Super admin, approves with a 2-step code) → **Paid** (after Flutterwave confirms).
8. Closing freezes the list of ledger rows included. Late events for that month (an undo, return or refund-driven exclusion after close) are not edited into it; they become a negative adjustment in the next open cycle (`author_earnings.adjustment_kobo`).
9. **Hold:** earnings are paid only after a hold (default 30 days, setting) to cover refunds, chargebacks and the 10-minute undo. The payout date is the first payout day (15th by default) on or after `cycle_closed_at + hold_days`. The Studio and admin must show the same date (open question 1).
10. **Minimum payout:** ₦1,000. An author below it is carried to next month, shown as "carried" and added to the next cycle.
11. **Unverified bank account:** the author is held, not skipped. Their earnings are paid in the first run after the account is verified, with no loss.
12. **Payouts paused** for an author (account dispute, suspected fraud, author request, other; reason required, logged, author not notified) are held until Finance or Super admin lifts the pause.
13. Preparing needs the checks to pass: credits match the ledger for the month; hold ended; Flutterwave balance covers the sendable amount; bank accounts verified (listing the ones that are not); unresolved failed transfers from the previous month listed (warn, not block).
14. **Release** needs: preparer ≠ approver, role Super admin, a 2-step code entered in the last 10 minutes. The confirm overlay states payable amount, amount held for unverified accounts, amount sent now, number of authors, Flutterwave balance. The action cannot be undone.
15. Each transfer has a unique reference `ARP-PO-{cycle}-{author}-{attempt}`. Releasing twice, or double-clicking, never creates duplicate transfers.
16. The author is notified (push and email) when their payout is sent and again when it is confirmed or failed.

**Failures and retries**
17. A transfer can end `successful`, `failed` (for example "account name doesn't match") or `reversed` (the bank returned it). Failed and reversed amounts go back to the author's payable balance and remain visible in Payouts.
18. **Blind retries are blocked.** A retry is allowed only if the bank account has been re-verified or replaced since the failure, or staff choose "Retry the same account" and confirm the author fixed it. Using a new account queues the retry automatically once it is verified (and the 48-hour pause has ended).
19. A transfer pending more than 48 hours is polled against Flutterwave and, if still unknown, raised to Finance. It is never retried until Flutterwave says it failed.
20. Retries use a new attempt number in the reference. Maximum 3 automatic attempts for transient errors (network, bank unavailable) with 1 hour then 6 hour delays; name and account errors are never automatic.

**Bank details and verification**
21. Authors add their account in the Studio after approval: bank (Nigerian banks), 10-digit account number, account name resolved by Flutterwave. The author sees the resolved name to catch mistakes. The number is masked everywhere after saving (last 4 digits).
22. The name from the bank is compared to the legal name on the application with a fuzzy score. At 90% or more the account is auto-verified. Below 90% it goes to the Bank accounts queue for a person: **Verify**, **Ask for document**, **Reject** (reason required).
23. Changing a bank account pauses payouts **to it** for 48 hours even after verification, and emails the author at the address on file. A payout date inside that window is held and sent in the next run (the 15th release is not affected unless the account changed after the cycle closed).
24. **Verify** releases held payouts and queues any waiting retry. **Reject** keeps earnings held and asks the author for a new account.
25. Payee type is stored per author: individual or company. Tax and withholding: see Open question 3.

**Statements**
26. A statement (PDF) is generated per author per cycle after approval: credits by book, tips and messages, rate, exclusions, carried amounts, payout reference. Staff can download it from the author page; the author's copy appears on `s-studio-royalties` once paid (open question 8).
27. A statement for the year to date is generated on request.

**Author screens**
28. `s-studio-royalties` shows the current month's earnings: Unlock all credits and ₦, Pay as you read credits and ₦, and `credits × ₦1.60`. It always labels the status of earlier months (Releases date, Paid, Held, Carried) and shows the plain note about stopping halfway.
29. Authors can check their own figure: the Studio total for a closed month equals the admin author earnings for the author, and both equal the sum of ledger rows.

**Admin**
30. `s-royalties`: first card is the month ready to release (amount, authors, hold end date, bank accounts needing verification); then one row per month with credits spent, earnings, authors, status.
31. `s-royalty-cycle`: earnings by author (book credits, tips and messages, credits, ₦, bank state), rows for authors held or carried, a calculation block, net revenue and what Arpedia keeps, checks, **More details: what was not paid** with the four exclusion counts, and the Release button (Super admin).
32. `s-royalty-settings`: hold days, minimum payout, payout day, gift-loop detection. Changes apply to the open month only. Only Super admin saves; Finance views. Every change is logged.
33. `s-payouts`: key numbers (paid, failed, pending, Flutterwave balance); transfer rows with bank and reference; failed and pending carry pills; **Retry** per failed row.

## States and edge cases
- **Empty:** author with no earnings: `₦0`, "You will see credits and naira here as readers unlock your books." First-ever month: payout history empty.
- **Loading:** skeletons for totals; admin cycle table shows loading rows; cycle totals are precomputed after close so the page is fast.
- **Error:** Flutterwave API down at release: transfers stay `queued`, no money lost, the run shows "paused, retrying" and alerts Finance. Failed ledger recheck blocks release with a diff.
- **Offline:** Studio earnings show last values with "Updated N hours ago". Bank change is disabled offline.
- **Double webhook:** the same Flutterwave transfer event twice changes nothing; ordering uses `status_rank` (queued < pending < successful or failed or reversed) so a late `pending` never overwrites `successful`.
- **Refund after spend:** only unspent credits are clawed back, so earnings stand. If a refund arrives after the cycle closed, nothing is deducted from the author.
- **Chargeback after payout:** loss is Arpedia's; no clawback from authors (open question 7).
- **Chapter returned after cycle close:** negative adjustment in next cycle; if the next cycle total would go negative for an author, the balance carries forward as a debit.
- **Author with open dispute or suspended:** held, shown as "Held, needs review" with the reason.
- **Flutterwave balance below the sendable amount:** release disabled; admin may release in part by author group (verified first) and the rest stays `approved_not_sent`.
- **Name change on bank side, bank closes account:** transfer reverses; author is asked to update the account.
- **Tip or message credits from a promo bonus:** earn the same ₦1.60 (bonus credits are real credits).

## Data
Money is `bigint` kobo; credits `integer`. Extends README `author_earnings`, `payout_runs`, `payouts`.

**`earning_cycles`** `id` · `month date` (first day, unique) · `status` (open, closed, prepared, approved, releasing, paid, paid_with_failures) · `closed_at` · `credits_books` · `credits_tips_messages` · `earnings_kobo` · `net_revenue_kobo null` · `prepared_by null` · `prepared_at` · `approved_by null` · `approved_at` · `hold_days int` · `payout_date date` · `ledger_check jsonb`.
**`author_earnings`** `id` · `cycle_id` · `author_id` · `book_credits` · `tip_message_credits` · `excluded_credits` · `amount_kobo` · `carry_in_kobo` · `adjustment_kobo` · `payable_kobo` · `status` (payable, carried, held_unverified, held_paused, held_dispute, queued, paid, partly_failed) · `held_reason null` · unique `(cycle_id, author_id)`.
**`earning_exclusions`** `id` · `ledger_id` · `cycle_id null` · `reason` (undone, staff_return, refund_clawback, gift_loop, self_read, takedown) · `credits` · `created_at`. Append-only; used to net the ledger without editing it.
**`payout_runs`** `id` · `cycle_id` · `started_by` · `approved_by` · `total_kobo` · `authors int` · `status` (queued, sending, done, done_with_failures) · `created_at`.
**`payouts`** `id` · `run_id` · `author_earning_id` · `author_id` · `bank_account_id` · `amount_kobo` · `attempt int` · `reference text unique` · `flutterwave_transfer_id null` · `status` (queued, pending, successful, failed, reversed) · `failure_reason null` · `queued_at` · `settled_at null` · `retry_of null`.
**`author_bank_accounts`** `id` · `author_id` · `bank_code` · `bank_name` · `account_last4` · `account_number_enc bytea` (encrypted; the key is held by the Cloudflare Worker that handles bank calls, never in the database) · `bank_account_name` · `legal_name` · `match_score numeric` · `status` (needs_review, verified, rejected, replaced) · `verified_by null` · `verified_at null` · `rejected_reason null` · `payouts_resume_at timestamptz` (48-hour pause) · `id_document_key null` · `created_at`.
**`payout_holds`** `author_id` · `reason` · `set_by` · `set_at` · `lifted_by null` · `lifted_at null`.
**`author_statements`** `id` · `author_id` · `cycle_id null` · `kind` (cycle, year_to_date) · `file_key` · `created_at`.
**`earning_settings`** singleton versioned: `hold_days` (30) · `min_payout_kobo` (100000) · `payout_day` (15) · `gift_loop_detection bool` · `effective_from` · `changed_by`. Applied to the open cycle only.

**RLS:** authors read their own `author_earnings`, `payouts`, `author_statements` and their own bank account row (masked columns only; encrypted number never returned to clients); they can start a bank change only through `submit_bank_account`. Staff Finance and Super admin read everything in this flow; Super admin only can approve, release, save settings; Publisher and Support read author earnings totals but not bank details. The client writes none of these tables.

**Migration from v25:** import past royalty cycles and payout history as closed and paid cycles (flagged `legacy`) so statements and history are continuous. Do not recompute v25 months with the new rate. Bank accounts are re-verified through Flutterwave on import; unverified ones are `needs_review`.

## Server
- **Earning stamp on spend:** the `spend_credits` path (flow 9) writes `author_id`, `author_earning_kobo` and `rate_version` on the ledger row when the book, tip or message has an author. Reversal rows write the negative amount.
- **`close_cycle(month)`** (cron, 1st 00:05 WAT; callable by Super admin to re-run before preparing): selects ledger rows in the month, nets `earning_exclusions`, applies carry-ins and adjustments, creates `author_earnings`, sets statuses (payable, carried below minimum, held for unverified, paused, dispute, suspended), stores `ledger_check` (sum of rows equals sum of lines). Idempotent per month.
- **`recheck_cycle(cycle)`:** recomputes from the ledger and returns the difference. Release is blocked unless it is zero.
- **`prepare_cycle(cycle)`:** Finance or Super admin; runs checks, sets `prepared_by`.
- **`release_cycle(cycle, otp_ok)`:** Super admin only; requires `approved_by <> prepared_by`, `aal2` session under 10 minutes, hold ended, ledger check zero. Inserts `payout_runs` and `payouts` (status `queued`), enqueues pgmq `payout_transfer` messages, writes `audit_log`. Safe to call twice (unique reference).
- **`payout-transfer` (Cloudflare Worker, consumes the pgmq `payout_transfer` queue through RPC, using the service key):** creates the Flutterwave transfer with the payout `reference` as idempotency key; records `flutterwave_transfer_id`; on API error leaves `queued` and retries per rule 20.
- **`flutterwave-transfer-webhook` (Cloudflare Worker; verifies the signature, then calls the ledger RPC; idempotent by provider event id):** verifies `verif-hash`, re-queries Flutterwave transfer by id, applies status with `status_rank` ordering, sets failure reason, updates `author_earnings.status`, notifies the author.
- **`poll_pending_payouts`** (cron, hourly): checks transfers pending over 48 hours.
- **`retry_payout(payout, mode)`:** Finance or Super admin; modes `same_account_confirmed` or `new_account_when_verified`; refuses if a newer successful payout exists for that earning; creates a new attempt.
- **`submit_bank_account(bank_code, number)`:** author; calls Flutterwave account resolve, stores encrypted number, score, sets `payouts_resume_at = now() + 48h`, emails the author, routes to review if score < 90.
- **`review_bank_account(id, decision, reason)`:** Finance or Super admin; Verify releases held rows and queued retries; Reject asks for a new account.
- **`pause_author_payouts(author, reason)` / `lift_pause`:** Finance or Super admin; reason required; audit log.
- **`generate_statement(author, cycle)`:** after approval; renders a PDF to R2, stores a row.
- **`exclude_gift_loop(ledger_ids)`:** called from the credits anomalies tool (flow 9); inserts `earning_exclusions`.
- **Cron:** `close_cycle` (monthly), `poll_pending_payouts` (hourly), `payout_reminder` (3 days before payout day: tells Finance about unverified accounts and low Flutterwave balance), `statements_after_release` (after run done).

## Admin side
`s-royalties` (cycle list and ready-to-release card), `s-royalty-cycle` (review by author, checks, Recheck against ledger, Export CSV, Prepare, Release), `s-royalty-release` (confirm), `s-royalty-settings` (view for Finance; Super admin saves), `s-payouts` (filters All, Successful, Pending, Failed, Reversed; Retry), `s-payout-retry` (choose retry mode, preview where the money goes), `s-bank-accounts` (needs review queue), `s-bank-account` (Verify, Ask for document, Reject; Account 1 of N bar; Skip; history folded), `s-author-payout` (author bank, history, statements, pause with reason). Roles: Finance prepares and reviews; Super admin approves and releases and edits settings; Support can view an author's payout state but not bank numbers. Every action writes `audit_log` with who and when.

## Analytics
`earnings_viewed` (author) · `payout_account_viewed` · `bank_account_submitted {bank, auto_verified}` · `bank_account_reviewed {decision}` · `cycle_closed {month, authors, kobo}` · `cycle_prepared` · `cycle_released {authors, kobo}` · `payout_settled {status}` · `payout_retry {mode}`. Financial reports come from the database.

## Done when
- [ ] On staging with seeded spend: close a month, see every author's earnings equal credits × ₦1.60, with an exclusion each for an undone chapter, a Support return, a refund and a gift loop.
- [ ] Prepare as one staff user, approve and release as another with a 2-step code; Flutterwave test transfers succeed; authors see Paid and get a push.
- [ ] A failed transfer ("account name doesn't match") cannot be retried blindly; verifying a new account then queues and completes the retry.
- [ ] An author below ₦1,000 is carried to the next month; an unverified author is held, then paid in the next run after verification.
- [ ] The Studio earnings screen, admin author page and cycle table show the same total for the same author and month.
- [ ] Changing a bank account pauses payouts to it for 48 hours and sends an email.
- [ ] pgTAP: `close_cycle` totals equal ledger sum and are idempotent; exclusions applied; `release_cycle` rejects same preparer and approver, non-Super admin, missing 2-step, unchanged ledger mismatch; duplicate release creates no duplicate payouts (unique reference); RLS (author sees own earnings and payouts only, encrypted number never returned, Finance cannot release).
- [ ] Vitest in `packages/core`: earning maths (credits × rate in kobo, no float error), pay-as-you-read split, minimum payout carry, payout date from close plus hold, fuzzy name score thresholds.
- [ ] Webhook replay tests: Flutterwave transfer events duplicated, out of order (successful then pending), reversed after successful.
- [ ] One Maestro path: author opens Earnings and Payout account on a seeded paid month.

## Not in this flow
- Reader-side refunds and credit grants: flow 9. Spend RPCs: flow 3.
- Automatic tax filing, VAT invoicing, 1099-style certificates.
- Payouts in other currencies, mobile money, or international authors.
- Per-book royalty shares, co-author splits, advances.

## Open questions
1. Payout timing is inconsistent in the prototypes: Studio shows October paid 15 Dec (30 days after close), admin shows October ready 15 Nov and November "Planned 15 Jan 2027". Default here: hold counted from close, so October pays 15 Dec; confirm which is intended, and what the 30 days start from.
2. Tips: `s-author` says "Author share 70%" (₦1,855 for 530 credits), which contradicts ₦1.60 per credit (₦848). Default: ₦1.60 per credit for tips too; fix the prototype.
3. Tax: WHT is "only applied to company payees". What rate and who remits (Arpedia deducts and files)? Do we collect TIN and issue certificates? Default: individuals 0%; companies at a configurable rate in settings; payee type and TIN collected at bank setup.
4. Who pays Flutterwave transfer fees: Arpedia (default) or deducted from the author?
5. Partial release when the Flutterwave balance is short: allow (default) or hold the whole run?
6. Taken-down books: are earnings before the takedown still paid, and are claim-related earnings clawed back? Default: earnings before the claim date are paid; after, frozen until decision.
7. Chargebacks after payout: Arpedia absorbs (default) or recover from future earnings?
8. Do authors download their own statements, and are statements PDF or CSV? Default: PDF in the Studio earnings screen after payout.
9. Does the legacy v25 royalty-pool history need to be shown to authors, or only totals?
10. Does a refunded top-up with partially spent credits claw back author earnings? Default: no, spent credits stay paid (matches admin rule).
