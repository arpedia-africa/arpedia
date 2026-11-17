# Flow 9 · Credits and plans

**Build order:** 6 · **Depends on:** flow 1 (sign-in, onboarding paywall), flow 3 (book page and unlock; it spends credits), flow 12 (book prices) · **Prototype:** app screens `s-credits`, `s-plans`, `s-checkout`, `s-plan-cancel` (data-flow 9) plus the paywall `s-plans-onboard` and `s-plans-all` (data-flow 1); admin screens `s-pricing`, `s-plan-edit`, `s-pricing-rules`, `s-pricing-rules-confirm`, `s-credits`, `s-revenue`, `s-transactions`, `s-refunds`, `s-subscriptions`, `s-subscription`, `s-promos`, `s-promo-new`, `s-user-credits`, `s-unlock-return`

## Goal
A reader can subscribe, receive credits, top up, pause or cancel, and always see exactly what their credits are and where they went. Staff can set prices, explain any balance from the ledger, and refund web payments. This flow owns every way credits **enter** the ledger and every way they **expire**. Flow 3 owns the spend RPCs (`unlock_book`, `charge_chapter`, `undo_chapter`); they call the shared `spend_credits` function defined here.

**Success looks like:** at least 90% of paywall views that tap Continue end in an active subscription; zero ledger rows that disagree with the store or Flutterwave in the weekly reconciliation; Support answers "why was I charged?" from the admin without an engineer.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Paywall (onboarding and all plans) | `s-plans-onboard`, `s-plans-all` | Choose a plan on first run or later. Built in flow 1; purchase behaviour is defined here |
| Secure checkout | `s-checkout` | Plan summary, "Subscribe with Google Play", Restore purchases |
| Credits | `s-credits` | Balance (plan vs rolled-over), top-ups, what credits buy, transaction history |
| Your plan | `s-plans` | Current plan, renewal date, switch plan, entry to pause or cancel |
| Pause or cancel | `s-plan-cancel` | Pause offer first (1, 2 or 3 months), honest cancel summary |
| Plans and pricing (admin) | `s-pricing`, `s-plan-edit` | Plan and top-up prices, price history, edit one plan |
| Pricing rules (admin) | `s-pricing-rules`, `s-pricing-rules-confirm` | Every rule from book to price and credit to author pay, plan margin check |
| Credits (admin) | `s-credits` | Issued, spent, owed, expiring, anomalies, staff grants |
| Revenue (admin) | `s-revenue` | Credits sold and spent, net revenue, deferred revenue, MRR |
| Transactions, Refunds | `s-transactions`, `s-refunds` | Every payment in; web refund decisions |
| Subscriptions | `s-subscriptions`, `s-subscription` | Subscriber list and detail with store ids and purchase events |
| Promo codes | `s-promos`, `s-promo-new` | Bonus credits, web plan discount, free trial days |
| Reader credits (admin) | `s-user-credits`, `s-unlock-return` | Full ledger per reader; return a chapter charge |

## Behaviour
**Plans and prices**
1. Plans (in-app / web): Monthly ₦900 / ₦800 = 300 credits; Quarterly ₦2,400 / ₦2,100 = 800; Yearly ₦8,400 / ₦7,500 = 3,000 (includes 200 bonus). Per month: ₦900, ₦800, ₦700. Same as v25 in structure; **New:** per-month ladder and credits at ₦3 each.
2. In-app prices are set in Google Play Console; web prices are set in admin and apply to new web checkouts immediately. Existing subscribers keep their price until their next renewal.
3. Paywall copy states the price, billing period and "Billed by Google Play every N months until you cancel" before the Continue button. Quarterly is badged Most popular, Yearly Best value.
4. Book equivalents ("about 6 books") are computed from the 125-credit example book and shown as approximate (`≈`).

**Subscribe (`s-checkout`)**
5. Subscribe calls the RevenueCat SDK purchase for the plan's store product. Access starts when RevenueCat reports the entitlement active in the app; credits appear when the server has processed the purchase event (normally under 10 seconds).
6. While waiting for credits the screen shows "Setting up your plan" and the app polls `my_credit_balance` for up to 30 seconds (polling, not Realtime), then shows "Your purchase went through. Credits will appear shortly" and keeps polling in the background. The user is never asked to pay again.
7. **Restore purchases** re-syncs with RevenueCat. It never grants credits itself; credits come only from the ledger. If the store account already has an active subscription on another Arpedia account, show "This Google Play subscription is linked to another Arpedia account" and do nothing.
8. Web checkout (Flutterwave) is a hosted page opened from the web app or the reader's account page; the app itself never offers it (Google Play policy). Web subscribers manage their plan from the web account page.

**Credits and ledger**
9. On first purchase and on every successful renewal the plan's credits are granted once (`plan_grant`). A second event for the same store transaction id grants nothing.
10. **Top-ups** are for subscribers only, at ₦3 a credit: 200 for ₦600, 500 for ₦1,500, 1,000 for ₦3,000. The app hides the top-up buttons and shows "Top-ups are for subscribers. See plans" when there is no active subscription. Top-up credits never expire while the account is open.
11. **Rollover:** at each renewal, unused credits of the plan just ended carry over one period, capped at one plan's worth of the plan being renewed into (Quarterly: 800). Credits already rolled over once and still unspent expire at that renewal. Excess over the cap expires. Each expiry is a ledger row.
12. Spend order: rolled-over credits first, then current-period plan credits, then promo bonus, then top-up credits. Expiring credits are always used before non-expiring ones.
13. The Credits screen shows one available balance with the split: this period (with refill date), rolled over (with "use by" date), and top-up if any. Balance is also shown as about N books (balance ÷ 125, rounded down).
14. History groups pay-as-you-read chapter charges under their book as one line ("Harmattan Letters · 36 of 125 paid"), expandable to chapters. Dates are readable ("12 Nov 2026, 09:14"). **Fixed** from v25: raw timestamps.
15. Messages to authors cost 5 credits and tips start at 10 (presets 10, 25, 50, 100), shown on the Credits screen under "What credits buy". Gifts are whole credits, minimum 10, and gifted credits cannot be gifted on within 24 hours. Both are spent through `spend_credits`; their screens are in other flows.

**Plan screen, pause, cancel**
16. `s-plans` shows current plan, status, renewal date and price. Switching and cancelling happen in Google Play for in-app subscribers; the screen says so and deep-links to the Play subscription page. Web subscribers switch and cancel in the app's web account page.
17. Pause or cancel opens `s-plan-cancel`, which offers a pause first: 1, 2 or 3 months, with the resume date stated. Pausing stops billing and credit grants; **every credit, including rolled-over ones, is kept and the rollover clock stops.** The library stays open.
18. Pause for in-app subscribers uses Google Play's subscription pause (RevenueCat reports it). For web subscribers the server cancels the Flutterwave plan and schedules a resume charge on the resume date.
19. The cancel summary states: credits from this period stay usable until the period ends; rolled-over credits expire at period end; unlocked books stay forever. The final cancel is a deep link to Google Play (or the web account page). We never hide the way out.
20. After the period ends with no renewal: status `expired`, plan credits and rolled-over credits expire (ledger `expiry` rows), top-up credits stay. Unlocked books stay in the library.
21. A reader who resubscribes after expiry gets a fresh grant, with no rollover.

**Renewal reminders**
22. Three days before renewal (`period_end - 3 days`, 09:00 WAT) the user gets a push and an in-app note: plan, price, date. Not sent for cancelled, paused or expired subscriptions, and not for Monthly if the subscription started under 3 days ago. One reminder per period.

**Admin pricing**
23. `s-pricing`: staff edit plan name, badge, web price, credits per period and effective date. In-app prices are read-only here (they live in the stores) but the product id is shown. Saving needs Super admin or Finance and a fresh 2-step code, and writes an audit log row and a price-change history entry.
24. `s-pricing-rules`: staff edit words per standard page (250), credits per page (0.5), credit value (₦3), free preview % (10), split-chapters-over pages (20), undo window minutes (10), author rate (₦1.60), rollover cap (1 plan), pause months (1 to 3), auto-unlock next chapter default (on). Saving needs Super admin and a 2-step code.
25. Before saving, `s-pricing-rules-confirm` shows how many books change price, the average before and after, the biggest change, and the plan check. Changes take effect at 00:00 WAT the next day. Books already unlocked and chapters already paid keep their price; readers part-way through pay as you read keep the price they started with.
26. **Plan check:** for every plan and top-up, `net per credit = price × (1 − store fee) ÷ credits` must exceed the author rate. Store fee defaults to 15%. If any plan fails, Save is disabled. Yearly is the tightest (₦2.38, ₦2.21 if VAT is withheld).

**Admin money screens**
27. `s-credits` (admin): key numbers are credits issued, spent, unspent (owed, ₦ at ₦3) and expiring this month. Anomalies list gift loops and many transfers in a short time; **Freeze gifting** is one tap with Undo.
28. Staff credit grants over 500 need a second approver (Finance or Super admin). Grants of 500 or less need only a reason. Both write a `staff_adjust` ledger row and an audit log row. The grantor and approver cannot be the same person.
29. `s-user-credits`: full ledger with reference ids and running balance, filterable by type. Grant credits is in the header. Export ledger produces a CSV.
30. `s-unlock-return`: Support returns a pay-as-you-read chapter charge after the reader's own 10-minute undo has ended. Reason required (skipped by mistake, chapter did not open, wrong book). The chapter locks again, the credits return to the buckets they came from, and the author is not paid for it.
31. `s-transactions`: every payment in, from Google Play, App Store and web, with gross, fee and net. Only Failed and Pending carry a pill. Resend receipt is available for web payments.
32. `s-refunds`: web payments only. Store refunds are decided by the stores and arrive by webhook. Recommendation: full refund if requested within 7 days and under 25% of the period's credits used. Staff choose Refund (full or partial) or Decline; the reader is emailed either way.
33. `s-subscriptions`: staff cannot cancel or refund store subscriptions. They can Extend by 7, 14 or 30 days (a promotional entitlement in RevenueCat), logged and with a push to the reader. Statuses: active, grace period, billing retry, cancelled (ends on date), expired, refunded.
34. `s-promos` / `s-promo-new`: three kinds: bonus credits, web plan discount (percent), free trial days. Codes are 4 to 16 letters or digits, case-insensitive, work at web checkout and in the in-app redeem box only, and cannot be edited after the first use (pause and create a new one). The form shows a reader preview and the worst-case cost.
35. `s-revenue`: revenue is recognised when a credit is spent or expires; unspent credits are deferred revenue. Figures are sales as they happen, not cash received.

## States and edge cases
- **Empty:** no plan: Credits shows balance 0, history empty ("Your credit history will show up here"), and one button to see plans. No top-ups shown.
- **Loading:** skeletons for balance and history. Prices come from RevenueCat offerings; show skeleton prices until loaded.
- **Error:** store unavailable: "Google Play is not responding. Try again" with retry. Purchase cancelled by user: return to checkout silently. Payment declined: store message passed through.
- **Offline:** Credits and plan screens show last known balance with "Updated 2 hours ago". Subscribe, top-up, pause and restore are disabled with "Connect to the internet to continue".
- **Double webhook:** the second delivery of any event is acknowledged with 200 and changes nothing (unique `(provider, event_id)` and unique ledger idempotency key).
- **Out-of-order webhooks:** each subscription stores `last_event_at`. A state change older than that is recorded but not applied. A RENEWAL arriving before INITIAL_PURCHASE creates the subscription from the renewal data and still grants once.
- **Refund after spend:** only unspent credits from the refunded purchase are clawed back (from that purchase's bucket, oldest first). Balance never goes below zero. Credits already spent stay spent and the author stays paid. The ledger shows how many were not recoverable.
- **Chargeback (web):** treated like a full refund: clawback of unspent credits, subscription ended, user flagged in Credits anomalies, Finance alerted. The Flutterwave fee is lost.
- **Plan change mid-period:** the new plan starts at the next renewal (default). The current period's credits and price are untouched. Rollover cap at that renewal uses the new plan's credits. Downgrade never removes credits.
- **Paused user:** no grants, no billing, no reminders. Credits and library stay. Top-ups are off (subscribers only). On resume, the normal renewal grant happens.
- **Expired card / billing issue:** Play grace period keeps access; status `grace`; the user sees "Update your payment method in Google Play" on `s-plans` and in a push. No grant until a successful renewal. If it ends unpaid, status `expired` after grace.
- **Duplicate web charge (same minute):** the second charge is a refund candidate in `s-refunds` with "Refund the duplicate"; credits are granted once per Flutterwave `tx_ref` of a distinct billing period only.
- **Top-up by a lapsed subscriber (race):** money was taken, so credits are granted and the row is flagged for Finance.
- **Promo code:** unknown, expired, used up or already used by this reader: specific plain message ("This code has ended"). No partial states.

## Data
Extends README tables `subscriptions` and `credit_ledger`. Money is stored in kobo (`bigint`), credits as `integer`. All times `timestamptz`; periods are shown in WAT.

**`plans`** `code text pk` (monthly, quarterly, yearly) · `name` · `months int` · `credits int` · `bonus_credits int` · `price_play_kobo` · `price_web_kobo` · `play_product_id` · `badge text null` · `active bool` · `effective_from timestamptz`. Price changes insert a new row version (`plan_price_versions`: plan, price_web_kobo, effective_from, changed_by).
**`topup_products`** `code` (topup_200 …) · `credits` · `price_kobo` · `play_product_id` · `active`.
**`pricing_rule_versions`** `id` · `effective_at timestamptz` · `rules jsonb` (words_per_page, credits_per_page, credit_value_kobo, preview_pct, split_pages, undo_minutes, author_rate_kobo, rollover_cap_plans, pause_max_months, auto_unlock_default) · `changed_by` · `approved_by` · `note`. The current version is the latest with `effective_at <= now()`.
**`subscriptions`** (extended) adds: `user_id` · `plan_code` · `store text` (play, web) · `status text` (active, grace, billing_retry, paused, cancelled, expired, refunded) · `auto_renew bool` · `period_start` · `period_end` · `pause_until timestamptz null` · `last_event_at` · `store_original_txn_id text` · `flutterwave_plan_id text null` · `pending_plan_code text null` (change at renewal) · `reminder_sent_for timestamptz null`.
**`payment_events`** `id` · `provider text` (revenuecat, flutterwave) · `event_id text` · `event_type` · `occurred_at` · `payload jsonb` · `received_at` · `processed_at null` · `error text null` · unique `(provider, event_id)`.
**`transactions`** `id` · `user_id` · `kind` (plan, topup) · `plan_code / topup_code` · `store` · `store_txn_id` (unique per store) · `gross_kobo` · `fee_kobo` · `net_kobo` · `status` (pending, succeeded, failed, refunded, disputed) · `period_start null` · `refunded_kobo` · `created_at`.
**`refund_requests`** `id` · `transaction_id` · `user_id` · `reason text` · `requested_at` · `credits_granted` · `credits_used` · `recommendation text` · `status` (waiting, refunded, declined) · `type` (full, partial) · `amount_kobo` · `decided_by` · `decided_at` · `flutterwave_refund_id null`.
**`credit_ledger`** (extended, append-only) `id` · `user_id` · `delta int` (never 0) · `reason` (README list plus `gift_out`, `gift_in`, `promo`) · `bucket text` (plan, rollover, topup, promo) · `expires_at timestamptz null` · `txn_id uuid` (groups rows from one action) · `ref_type / ref_id` (transaction, book, chapter, subscription, ticket) · `idempotency_key text` (unique where not null) · `book_id / chapter_id null` · `author_id null` · `author_earning_kobo int default 0` · `rate_version uuid null` · `actor_id null` (staff) · `note text null` · `created_at`. Staff returns use reason `undo` with `actor_id` set; refund clawbacks use reason `refund`.
**`credit_balances`** `user_id pk` · `plan int` · `rollover int` · `topup int` · `promo int` · `updated_at`. A cache maintained by a trigger on the ledger, never written by anyone else; the nightly job `ledger_reconcile` recomputes from the ledger and alerts on any difference.
**`credit_daily_snapshot`** `day` · `issued` · `spent` · `expired` · `unspent_total` · `unspent_by_bucket jsonb`. Source for deferred revenue.
**`credit_grant_requests`** `id` · `user_id` · `credits` · `reason` · `requested_by` · `approved_by null` · `status` (pending, approved, rejected, applied) · check `approved_by <> requested_by`.
**`promo_codes`** `code (lower, unique)` · `kind` (bonus_credits, plan_discount, trial_days) · `amount int` · `max_uses` · `uses_per_reader` · `new_readers_only` · `web_only` · `starts_at` · `ends_at` · `campaign_tag` · `status` (scheduled, active, paused, ended) · `locked_at` (set at first use). **`promo_redemptions`** `code` · `user_id` · `transaction_id null` · `redeemed_at` · unique `(code, user_id)` unless `uses_per_reader > 1`.

**RLS (plain words):** readers can read only their own `credit_ledger`, `credit_balances`, `subscriptions`, `transactions`, and `promo_redemptions`; nobody writes them from the client. `plans`, `topup_products` and the current pricing rules are readable by everyone signed in. `payment_events`, `refund_requests`, `credit_grant_requests`, `pricing_rule_versions` writes and all reads are staff only (Finance, Super admin; Support can read ledger and subscriptions). Ledger has no update or delete grants for any role, including `service_role` in normal functions (a trigger raises on UPDATE and DELETE).

**Migration from v25:** import active subscriptions with plan, period end and store ids; set `last_event_at` to the import time. Opening ledger row per user: reason `staff_adjust`, note "v25 balance", bucket by best mapping (unused plan credits to `plan`, purchased to `topup`). Users with a v25 balance but no subscription keep it as `topup`. Open question 6.

## Server
All money functions are Postgres RPCs (security definer, run in one transaction, callable only with the service key (from a Cloudflare Worker) or by the stated staff roles). All server-side TypeScript (webhooks, third-party calls, push, signed URLs) runs on **Cloudflare Workers**; Supabase provides Postgres (RLS, RPCs, pg_cron, pgmq) and Auth only, with no Supabase Edge Functions and no Realtime. Workers verify the provider signature first, then call the ledger RPCs; idempotency is by provider event id.

- **`revenuecat-webhook` (Cloudflare Worker):** verifies the shared authorization header; inserts into `payment_events` (conflict on `(provider, event_id)` returns 200 and stops); calls `apply_payment_event`. Always answers 200 for known duplicates, 5xx on failure so RevenueCat retries.
- **`flutterwave-webhook` (Cloudflare Worker):** verifies the `verif-hash` header, then **re-queries Flutterwave by transaction id** and trusts only that response (amount, currency NGN, status). Same insert-then-apply path. Handles `charge.completed`, refund and chargeback events, and plan cancellation.
- **`apply_payment_event(event_id)`:** maps INITIAL_PURCHASE, RENEWAL, NON_RENEWING_PURCHASE (top-up), CANCELLATION, EXPIRATION, BILLING_ISSUE, PRODUCT_CHANGE and PAUSE or their Flutterwave equivalents to one of the functions below. Skips state changes older than `subscriptions.last_event_at`. Marks `processed_at`.
- **`grant_plan_credits(user, subscription, txn_ref, period_start)`:** idempotency key `plan:{store_txn_id}`. Runs `roll_over(user, plan)` first, then inserts the `plan_grant` row (delta = plan credits, bucket plan, `expires_at = period_end`), updates `subscriptions`. Returns credits granted or 0 if already granted.
- **`roll_over(user, new_plan)`:** reads the remaining `plan` and `rollover` buckets; inserts `expiry` rows for all remaining `rollover`; moves `min(remaining plan, cap)` to `rollover` (one `expiry` row for the plan bucket and one `rollover` grant row, linked by `txn_id`); the excess is an `expiry` row.
- **`grant_topup(user, topup_code, txn_ref)`:** idempotency key `topup:{txn_ref}`; checks subscription is active unless called from a webhook (then flags). Bucket `topup`, no expiry.
- **`spend_credits(user, amount, reason, ref, idempotency_key)`:** internal, called only by flow 3 RPCs. Locks the `credit_balances` row, checks balance is at least `amount`, writes one ledger row per bucket in spend order (rule 12) with the same `txn_id`, returns the rows. Raises `insufficient_credits` with the shortfall. Never lets a bucket go below zero.
- **`clawback_purchase(transaction_id, reason)`:** used by store refunds, web refunds and chargebacks. Removes `min(granted, bucket balance)` from the buckets that purchase filled, reason `refund`; ends the subscription (full refund or chargeback only); returns credits removed and credits unrecoverable.
- **`staff_grant_credits(user, credits, reason)` / `approve_credit_grant(request_id)`:** ≤ 500 applies at once; > 500 creates a request. Approver must differ from requester and hold Finance or Super admin.
- **`staff_return_chapter(charge_ledger_id, reason_code, note)`:** Support or higher; checks the charge is a chapter charge, not already undone, and that the 10-minute undo has ended; writes the reversing ledger row (reason `undo`, with `author_earning_kobo` negative), removes the chapter entitlement, audit log.
- **`pause_subscription(subscription, months)` / `resume_subscription`:** months 1 to 3; web only (Play pause arrives by webhook). Sets `status = paused`, `pause_until`. **`request_refund(transaction)`** by reader (web, within 14 days); **`decide_refund(request, type, amount)`** Finance or Super admin; calls Flutterwave refund, then `clawback_purchase`.
- **`redeem_promo(code)`:** checks window, uses, reader eligibility; bonus credits create a `promo` ledger row with idempotency key `promo:{code}:{user}`.
- **`save_pricing_rules(rules, otp_ok)` and `save_plan(plan)`:** run the plan check (rule 26), insert a new version with `effective_at` (next 00:00 WAT for rules), write the audit log. Require staff role and `aal2` session younger than 10 minutes.
- **Cron jobs (pg_cron in Postgres; the ones that send push or call stores trigger a Cloudflare Worker through a queue message):** `renewal_reminders` (hourly), `expire_ended_subscriptions` (every 15 minutes: moves `grace` or `cancelled` past `period_end` to `expired` and writes expiry rows), `resume_paused_web` (hourly), `credit_daily_snapshot` (00:10 WAT), `ledger_reconcile` (nightly), `store_reconcile` (weekly: compares RevenueCat and Flutterwave transaction lists with `transactions`).

## Admin side
Prototype ids and what staff can do: `s-pricing` and `s-plan-edit` (edit web prices, credits, badge, effective date; view history); `s-pricing-rules` and `s-pricing-rules-confirm` (edit rules, preview impact, save with 2-step code); `s-credits` (watch issued, spent, owed, expiring; freeze gifting; approve grants); `s-revenue` (revenue by product, platform, month; MRR; churn); `s-transactions` (search by reference, resend receipt, open refund); `s-refunds` (decide); `s-subscriptions` and `s-subscription` (read-only store data, extend days, open RevenueCat, resend receipt); `s-promos` and `s-promo-new` (create, pause); `s-user-credits` (ledger, grant, export); `s-unlock-return` (return a chapter). Roles: Finance and Super admin for money; Support for ledger read, grants up to 500 and chapter returns. Every action writes `audit_log`.

## Analytics
`paywall_viewed {source, plan_shown}` · `plan_selected {plan, price}` · `checkout_started` · `purchase_completed {plan, store, price}` · `purchase_failed {reason}` · `topup_started`, `topup_completed {credits}` · `credits_viewed` · `pause_offered`, `pause_started {months}` · `cancel_started`, `cancel_confirmed {reason?}` · `renewal_reminder_sent` · `promo_redeemed {kind}`. Revenue reports come from the database, not PostHog.

## Done when
- [ ] On a real Android phone with the Play sandbox: subscribe to Quarterly, see 800 credits, top up 200, restore purchases, pause 1 month and see credits kept, resume.
- [ ] Renewal in the sandbox grants credits once, rolls over unused credits up to the cap, and the balance split on `s-credits` matches the ledger.
- [ ] Web checkout in Flutterwave test mode grants the web plan credits; a replayed webhook changes nothing.
- [ ] Admin: edit a web price, save pricing rules with the confirm screen, grant 600 credits needing a second approver, return a chapter, refund a web payment.
- [ ] pgTAP: `grant_plan_credits` idempotency and rollover cap; `roll_over` expiry rows; `spend_credits` bucket order and insufficient balance; `clawback_purchase` never negative; ledger UPDATE and DELETE blocked; RLS (reader sees only own rows); grant approver differs from requester; `staff_return_chapter` after and before undo window.
- [ ] Vitest in `packages/core`: plan check and net-per-credit maths, rollover and cap, renewal date and pause resume date, book price rounding, spend order.
- [ ] Webhook replay tests: RevenueCat and Flutterwave duplicate, out of order (RENEWAL before INITIAL_PURCHASE, CANCELLATION before RENEWAL), refund after spend, chargeback, grace then recovery.
- [ ] One Maestro path: sign in, open paywall, Subscribe (sandbox), see credits, open Credits.
- [ ] Weekly `store_reconcile` shows zero unmatched transactions on staging data.

## Not in this flow
- iOS and App Store billing (RevenueCat is ready; ship after Android launch). Admin screens already show App Store rows for later.
- Spending (unlock, chapters, undo): flow 3. Messages, tips and gifts screens: flows 6 and 8.
- Gift-card or voucher sales, family plans, student pricing, currencies other than NGN.
- Author earnings and payouts: [13-earnings-payouts.md](13-earnings-payouts.md).

## Open questions
1. Google Play policy: confirm subscription credits and consumable top-ups comply, and that web-only promo codes and the "web is cheaper" note are allowed in-app (README open decision 4).
2. Upgrades: immediate with proration or at next renewal? Default here: next renewal.
3. Can a paused reader spend existing credits? Default here: yes, expiry clock frozen.
4. Refund of web payment when credits are spent: prototype says "2 books lose access" but earnings rules say spent credits stay paid. Default here: books stay, only unspent credits are removed.
5. Prototype inconsistencies to fix: `s-subscription` shows Quarterly "900 credits per period" (should be 800); admin subscriber lists show Monthly ₦1,000 and Yearly ₦8,600 (stale); `s-pricing` top-up price cells show only "₦" with no amount. **Resolved 16 Nov:** prototype, BRIEF.md and book-pipeline.md corrected.
6. v25 balances: how are unused v25 credits mapped (rollover, top-up, or lost)? Default: top-up bucket, non-expiring.
7. Is there an app screen for the in-app promo redeem box? Admin assumes one; no app screen exists. Default: a field on `s-credits`.
8. Play grace period length (3, 7 or 14 days) and account-hold behaviour.
9. Web renewals: Flutterwave Payment Plans (their scheduler) or our own cron charging a saved card token? Default: Flutterwave Payment Plans.
10. `docs/book-pipeline.md` still lists length tiers (45, 90, 135, 180 credits); this PRD follows README and BRIEF v4 (pages ÷ 2). The pipeline doc needs correcting. **Resolved 16 Nov:** prototype, BRIEF.md and book-pipeline.md corrected.
