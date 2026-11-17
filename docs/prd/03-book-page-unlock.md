# Flow 03 · Book page, preview and unlock

**Build order:** 4 · **Depends on:** flows 01 (sign-in), 02 (discovery), 12 (book pipeline: a published revision with chapters and prices must exist) · **Prototype:** app screens `s-book`, `s-book-more`, `s-book-about`, `s-reviews`, `s-review-actions`, `s-write-review`, `s-book-discussion`, `s-unlock`, `s-unlock-paygo`, `s-unlock-low`, `s-unlock-nosub`, `s-gift`, `s-tip` · admin screens `book` (Details), `book-access`, `book-stats`

## Goal
A reader can open any book, see what it costs in plain credits before spending, read the free 10%, and unlock it all at once or chapter by chapter. They can also gift the book, tip the author, and read and write reviews. This is where money first moves, so every spend is stated before the tap, is idempotent, and can be explained by Support from the ledger.

**Success looks like:** 60% of book-page views by subscribers with enough credits reach "Start reading" or an unlock within the session; zero double charges and zero negative balances in the ledger audit query.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Book page | `s-book` | Cover, title, author, rating, price, balance, two ways to pay, About, top review, locked Discussion, Readers also loved |
| Book options | `s-book-more` | Download for offline, Gift, Tip, Report this book |
| About this ebook | `s-book-about` | Description and facts: language, age, publisher, ISBN, length, price, chapters, size, content notes |
| Ratings and reviews | `s-reviews` | Rating summary, 5 to 1 filter chips, review list |
| Review options | `s-review-actions` | Report review, Hide reviews from this person, Copy text |
| Write a review | `s-write-review` | Stars, text, spoiler switch |
| Book discussion | `s-book-discussion` | Locked until 95% read; shows progress and Keep reading |
| Unlock: whole book | `s-unlock` | Unlock all sheet: balance, price, balance after |
| Unlock: pay as you read | `s-unlock-paygo` | Pay as you read sheet with Auto-unlock switch |
| Unlock: not enough credits | `s-unlock-low` | Missing credits, cheapest top-up, pay as you read alternative |
| Unlock: no plan yet | `s-unlock-nosub` | Explains credits come with a plan |
| Gift this book | `s-gift` | Pick a friend, message, send |
| Tip the author | `s-tip` | Preset credit amounts, optional note |

The unlock sheets reached from inside the reader (`s-preview-end`, `s-reader-chapter`, `s-pay-rest`) belong to [04-reading.md](04-reading.md) but call the same RPCs defined here.

## Behaviour

### Book page (`s-book`)
1. The page shows the revision readers currently get (`books.current_revision_id`). It never shows a draft, scheduled or unpublished revision.
2. Header: cover on the orange sunflower band, title, author (tap opens `s-author`), Follow button next to the author (same state as the author profile), genre, standard pages and reading time ("250 pages · about 5 hr read"). Reading time = words ÷ 230 words per minute, rounded to the nearest 5 minutes. Same as v25: Save and Share in the top bar.
3. Stats row: rating (one number, 1 decimal, same value on every screen, read from `book_rating_stats`), reads, comments. Rating opens `s-reviews`; comments opens `s-book-discussion`. Reads and comments above 999 show as "1.2K".
4. **One main button.** The label depends on the reader's state:
   - No progress: "Start reading · first 10% free" (opens the reader at the start).
   - Has progress: "Continue reading · 38%".
   - Finished: "Read again".
   - Coming soon (revision `scheduled`): "Notify me" instead of any buying controls. No reading, no price block.
5. **Buy block** under the button, only when the reader does not own the whole book:
   - **Unlock all**: price in credits, "Whole book, offline". Opens `s-unlock`.
   - **Pay as you read**: "≈ N a chapter" where N = round(price ÷ number of chargeable chapters), "Stop anytime". Opens `s-unlock-paygo`.
   - **Balance line**: "Your balance 840 credits" and a Top up link to `s-credits`.
   - If the reader has paid for some chapters: the block shows "Paid 27 of 125 · Pay the rest 98" and replaces the two options with one Pay the rest button (opens the pay-the-rest sheet, defined in flow 04, which calls `unlock_book`). The owner of the whole book sees an "Unlocked" pill and no buy block.
6. Readers without a plan still see the buy block. Tapping a button follows the rules in "Credit checks" below.
7. **About this book**: description clamped to 4 lines, tags under it (up to 4 pills), arrow to `s-book-about`.
8. **Ratings and reviews**: big rating, 5 to 1 bars, review count, the single top review (highest likes among reviews of 4–5 stars with text; if none, the newest with text), Write a review button, See all reviews. The top review is never one the reader has hidden.
9. **Discussion row** is a locked row until the reader's `max_percent` is at least 95 (see flow 04, "finished"). Tapping it opens `s-book-discussion`.
10. **Readers also loved**: up to 8 books from `book_related` (readers who finished this book also finished these). Fallback when fewer than 4: top-rated books in the same genre. Books the reader already owns are listed last. Title of the section stays; the subtitle names the book.
11. Book options (`s-book-more`, the ⋯ menu):
    - **Download for offline**: if the reader owns the whole book, downloads it; if they own some chapters, downloads those chapters plus the free preview; if they own nothing, downloads the preview only and says so in a toast. Starts the download through flow 04's `request_download`.
    - **Gift this book** opens `s-gift`. **Tip the author** opens `s-tip`. **Report this book** opens a report sheet (reasons: wrong content, copyright, abuse) that writes a `reports` row (flow 14).
12. The book page never shows the file format or the revision number to readers.

### Credit checks (apply to Unlock all, Pay as you read, Gift, Tip)
13. Money is stated before the tap. Every spending button's label includes the amount ("Unlock for 125 credits", "Send gift · 125 credits", "Send 50 credits").
14. Let `need` be the amount the action would spend and `balance` the reader's current credit balance.
    - Reader has no active, paused or past-due subscription **and** `balance < need` → show `s-unlock-nosub`.
    - Reader has a subscription (any state allowing top-ups) **and** `balance < need` → show `s-unlock-low`.
    - `balance ≥ need` → show the confirm sheet (`s-unlock`, `s-gift`, `s-tip`), whether or not they have a plan. (A lapsed reader with leftover credits can still spend them.)
15. For Pay as you read, `need` is the price of the first chargeable chapter not yet paid. The sheet itself spends nothing; "Start reading" opens the reader.

### Unlock all (`s-unlock`)
16. Sheet header: "Unlock {title}", subtitle "{pages} pages · {chapters} chapters · {price} credits". A segmented control switches between Unlock all and Pay as you read without closing the sheet.
17. Rows: Your balance, This book (− price), After unlock. Perks list: the whole book downloads for offline reading, the author is paid in full today, yours to keep even if you cancel your plan.
18. The price shown is `effective_price` (see Data). If the reader already paid for chapters, the sheet becomes **Pay the rest**: price, already paid (−), left to pay; the button reads "Pay {left} credits". The total paid never exceeds the price.
19. Tapping the button calls `unlock_book`. While waiting the button is disabled and shows a spinner; the sheet cannot be dismissed by the backdrop. The sheet generates one idempotency key when it opens and reuses it for every retry of the same tap.
20. On success: close the sheet, show a toast "Unlocked · {balance} credits left", switch the main button to "Start reading" (or "Continue reading"), and start the offline download of the whole book in the background (flow 04). The book appears in Library > Reading.
21. On `price_changed` (the price moved while the sheet was open): refresh the numbers, show "The price changed to {n} credits", spend nothing, and require another tap. On `insufficient_credits`: switch to `s-unlock-low` with fresh numbers. On a network error: keep the sheet open, show "No connection. Nothing was charged. Try again." and keep the same key.

### Pay as you read (`s-unlock-paygo`)
22. Rows: "First 10% (about {n} pages)" Free; "Each chapter after that" About {N} credits; "Most you'll ever pay" {price} credits. Body copy: a chapter's credits are taken when you turn past its first page, re-reading is free, you can pay the rest whenever you like.
23. **Auto-unlock next chapter** switch, on by default. It is the same setting as in reader settings (stored in `profiles.reader_settings.auto_unlock`).
24. "Start reading" spends nothing. It opens the reader at the reader's position (or the start). Chapter charging is defined in flow 04.
25. Pay as you read is available for every book with at least one chargeable chapter. A book with no chargeable chapter (entire book inside the preview, which only happens for under-10-page books) offers only Unlock all.

### Not enough credits (`s-unlock-low`)
26. Title: "You need {missing} more credits" where missing = need − balance. Subtitle names the book and its price. Rows: book with pages and price, Your balance.
27. Copy tells the reader when the plan next adds credits (from `subscriptions.current_period_end`) and offers pay as you read as the free alternative: "your {balance} credits cover the next {k} chapters" where k = how many consecutive unpaid chapters, from the first unpaid one, the balance can pay. If k = 0 the sentence is omitted.
28. Top-up options are the three fixed packs (200 for ₦600, 500 for ₦1,500, 1,000 for ₦3,000), each with "≈ {credits ÷ avg_book_price} books" where `avg_book_price` is the config value `avg_book_price_credits` (default 125). The smallest pack that covers `missing` is preselected and labelled "Enough for this book". If `missing` exceeds 1,000, the 1,000 pack is preselected and the copy says a second top-up is needed.
29. The button "Buy {n} credits · ₦{price}" opens `s-pack-sheet` (flow 09, store purchase). When the purchase completes the reader returns to the unlock sheet with the new balance. **Nothing is spent automatically**: the reader taps Unlock again.
30. Top-ups are for subscribers only. A reader whose subscription is cancelled and ended sees `s-unlock-nosub` instead, never this sheet.

### No plan yet (`s-unlock-nosub`)
31. Explains that credits come with a plan, states the book price and how many books like it the Quarterly plan covers (800 ÷ price, rounded down). A callout says the first 10% is free with or without a plan. Primary button "See plans from ₦{lowest per-month plan price}" opens `s-plans` (the lowest per-month price is computed from the plans config, never typed in copy). Secondary "Keep reading the free 10%" opens the reader.

### Gift (`s-gift`)
32. Title "Gift {title}", subtitle "{price} credits from your balance". A search field filters the people the reader can gift: people who follow the reader and members of groups the reader is in. Each row shows name and why ("Follows you", "In Grace Readers"). One person can be selected.
33. People who already own the book, or hold any chapter of it, are shown disabled with "Already has it". Blocked people never appear. A reader cannot gift to themselves. Coming-soon books cannot be gifted (the Gift option is hidden).
34. Optional message, max 140 characters. Button "Send gift · {price} credits" follows the credit checks above.
35. `gift_book` charges the sender the full price, creates a whole-book entitlement for the recipient, and sends the recipient a push ("{name} sent you {title}") and a Saved-shelf entry marked "Gift from {name}". The author is paid as for a sale. The recipient does not need a plan to read; offline downloads follow the normal plan rule.

### Tip (`s-tip`)
36. Title "Tip {first name}", subtitle "₦{credits × 1.60} of {credits} credits reaches her with her monthly earnings", updating live as the amount changes. Amounts are presets 20, 50, 100 credits (50 preselected). Optional note, max 140 characters. Button "Send {n} credits".
37. `tip_author` charges the reader, credits the author's earnings at ₦1.60 per credit, and sends the author a push with the amount and note. A reader cannot tip an author they are (their own book). Tips are final: no undo.
38. Tip is also reachable from the finish screen (`s-book-end`, flow 04) and uses the same sheet.

### About (`s-book-about`)
39. Shows the full description, then facts. A fact with no value is **left out**; there are no fallbacks like "Ages 13+" or "Arpedia Press". Facts: Language, Age, Author (link), Publisher, Published on, ISBN, Genre (link to Explore), Purchases, Length ("62,400 words · 250 pages"), Price ("125 credits (₦375) · half a credit a page"), Chapters ("14 · about 4 h 30 min"), Size (MB of the full file set).
40. Content notes are pills from `book_revisions.content_notes`. A green "No explicit content" pill shows when the revision is marked clean by review.
41. Purchases = count of distinct readers with any paid or gifted entitlement for the book.

### Ratings and reviews (`s-reviews`, `s-write-review`, `s-review-actions`)
42. Summary: rating, stars, review count, 5 to 1 breakdown. The numbers equal the book page (same table). Filter chips 5 to 1 (single select; tapping the active chip clears it). Default order: newest first. Each review shows name, stars, likes, age. A review marked spoiler shows "Contains spoilers. Tap to reveal" and hides the text until tapped.
43. **Write a review** (also from Library > Finished "Rate this book"): stars required (44px targets), text optional up to 1,000 characters with a counter, spoiler switch. Only a reader who has reached 95% of the book can post. Others tap Write a review and see a toast "Finish the book to review it". (Default; see Open questions.)
44. One review per reader per book. Reopening Write a review edits it. A reader can delete their own review. The stats table updates in the same transaction.
45. The ⋯ on a review opens `s-review-actions`: **Report review** (creates a `reports` row, flow 14), **Hide reviews from {name}** (writes `hidden_reviewers`; only this reader stops seeing that person's reviews, everywhere), **Copy text**. Your own review shows Edit and Delete instead of Report and Hide.
46. A like toggles per reader per review. Likes are shown as counts only.

### Book discussion (`s-book-discussion`)
47. Before 95%: shows "Finish the book to join in", the reader's percent and "Chapter x of y", a Keep reading button (opens the reader at their position), and two open rows: "Passage talk is open" (comment count on the reader's current chapter, only up to their position) and the club row if a club is reading it. At 95% or more the screen redirects to the book room (`s-channel`, flow 06). The 95% gate is enforced by the server (flow 06 RLS), not only by the screen.

## States and edge cases
- **Empty:** no reviews: "Be the first to review this book" with Write a review (if allowed). No Readers also loved: the section is hidden. No content notes: the block is hidden.
- **Loading:** skeleton cover band, title lines, two button skeletons. Price and balance show skeleton chips; the buy buttons are disabled until both load (never show a stale price).
- **Error:** load failure shows a retry state. Unpublished or missing book: "This book isn't available right now" with a back button. Sheets show inline errors, never silent closes.
- **Offline:** the page renders from the last cached copy (read-only) marked "Offline". Unlock, Gift, Tip, Write a review and Report are disabled with "Connect to continue". Start reading works for any book with downloaded content.
- **Price change while open:** `expected_price` mismatch handled by rule 21.
- **Double tap or retry:** the same idempotency key returns the original result; one charge only.
- **Two devices:** a purchase on device A shows on device B on next focus (the book page refetches on focus).
- **Revision update:** a reader who bought upfront keeps access to the new revision at no charge. A pay-as-you-read reader keeps the price they started with (rule from flow 11): their cap is the lower of their snapshot price and the new price, minus what they paid (never negative).
- **Unpublished after purchase:** owners keep access when the staff decision was "Keep access" (flow 12); the book page shows the owned state but is hidden from Discover.
- **Large text and 360px:** the two buy options stack vertically; labels never truncate the price.
- **Reduced motion:** no count-up on balance; sheets fade.

## Data
Extends the core model. All money is integer credits; naira in integer kobo.

**`book_revisions`** (columns added or relied on): `price_credits int not null`, `pages int` (standard pages), `words int`, `preview_percent numeric(4,1) default 10`, `preview_cut_para_id text`, `content_notes text[]`, `age_rating text null`, `publisher text null`, `isbn text null`, `language text`, `file_bytes int`.
**`books`**: `current_revision_id`, `price_override_credits int null`, `price_override_reason text null`, `preview_override_percent numeric(4,1) null`, `reads_count int`, `comments_count int` (both maintained by triggers). View `book_effective` exposes `effective_price = coalesce(price_override_credits, revision.price_credits)` and `effective_preview_percent`.
**`chapters`**: `chapter_uid uuid` (stable across revisions), `ord int`, `title`, `pages numeric(7,2)`, `price_credits int` (0 for chapters entirely inside the preview). The sum of `price_credits` over a revision's chapters equals the revision's `price_credits` exactly (largest-remainder allocation, see flow 12). Full allocation rules live in flow 12 (computed in `packages/core`, validated by `set_chapter_prices`).
**`book_price_history`**: `id`, `book_id`, `revision_id`, `kind ('computed'|'override'|'revision')`, `old_credits`, `new_credits`, `reason`, `staff_id null`, `created_at`.
**`credit_ledger`** (append-only; no UPDATE or DELETE grants for any role): `id bigint identity`, `user_id`, `delta int` (negative for spends), `reason` (README list plus `gift`), `book_id null`, `chapter_uid null`, `ref_ledger_id bigint null` (the row an `undo` reverses; unique where not null), `counterparty_user_id null` (gift recipient), `author_id null`, `author_earning_kobo int default 0` (credits × 160 for spends, negative on undo), `idempotency_key text` (unique per user), `balance_after int`, `meta jsonb`, `created_at`. Flow 09 adds credit lots (plan vs rolled-over vs top-up) and expiry; `spend_credits` below is the single internal function both flows use.
**`entitlements`**: `id`, `user_id`, `book_id`, `scope ('book'|'chapter')`, `chapter_uid uuid null`, `source ('unlock_all'|'chapter'|'chapter_complete'|'gift'|'staff')`, `ledger_id`, `created_at`, `revoked_at null`, `revoked_reason null`. Unique: one active book entitlement per (user, book); one active chapter entitlement per (user, book, chapter_uid). Entitlements point at a stable chapter id (`chapter_uid`, not an encryption key), so they survive new revisions.
**`paygo_accounts`**: `user_id`, `book_id`, `snapshot_price int` (the effective price at the reader's first chapter charge), `created_at`. Created by `unlock_chapter`; never changed. It lets a reader keep the price they started with when the book is updated.
**`gifts`**: `id`, `sender_id`, `recipient_id`, `book_id`, `message`, `ledger_id`, `created_at`, `seen_at null`.
**`tips`**: `id`, `ledger_id`, `from_user_id`, `author_id`, `book_id`, `credits`, `note`, `created_at`.
**`reviews`**: `id`, `book_id`, `user_id`, `stars smallint 1..5`, `body text ≤1000 null`, `spoiler bool`, `status ('visible'|'hidden_by_mod')`, `created_at`, `edited_at`. Unique (book_id, user_id). `review_likes (review_id, user_id)`. `hidden_reviewers (user_id, hidden_user_id)`.
**`book_rating_stats`**: `book_id`, `avg numeric(3,2)`, `count int`, `h1..h5 int`; updated by a trigger on `reviews`.
**`book_related`**: `book_id`, `related_book_id`, `score`; rebuilt nightly by `pg_cron` from finished-together counts.
**`saved_books`** is owned by flow 05.

**RLS (plain words):**
- `credit_ledger`, `entitlements`, `gifts`, `tips`: a user can read only their own rows (gift recipients can read the gift row). Nobody, including the app, can insert, update or delete these directly. Only the SECURITY DEFINER functions below write them.
- `reviews`: anyone signed in can read visible rows; a user can insert, update or delete only their own, and only if `reading_progress.max_percent >= 95` for that book (checked in policy, not in the app).
- `hidden_reviewers`, `review_likes`: owner-only.
- `books`, `book_effective`, `chapters` for readers: only the current approved revision.
- Staff-only columns (`price_override_*`) are written only through `admin_set_book_price`.

**Migration from v25:** import v25 unlocks as `entitlements` (scope `book`, source `staff`, `meta.v25_purchase_id`) with a single zero-delta `staff_adjust` ledger row each, so history is explainable. Import v25 reviews into `reviews` and recompute `book_rating_stats`. v25 had two different ratings on screen; only the recomputed value is used.

## Server
All functions run as the calling user (`auth.uid()`), SECURITY DEFINER with a fixed search_path, and take an `idempotency_key text`.

**`spend_credits(user, amount, reason, book_id, chapter_uid, author_id, key, meta)`** (internal, not callable by clients): takes `pg_advisory_xact_lock(hashtext(user::text))`; returns the existing ledger row if (user, key) already exists; raises `insufficient_credits` (with `missing`) if the derived balance is below `amount`; inserts one negative `credit_ledger` row with `balance_after` and `author_earning_kobo = amount × 160` when `author_id` is set. Never callable except from the RPCs below, so credits cannot be spent any other way.

**`unlock_book(book_id, expected_price, key) → {ledger_id, spent, balance, entitlement_id, status}`** (reader): checks the book is live and not coming soon; recomputes `remaining = cap − sum of active chapter charges`, where `cap` is `effective_price`, or `least(snapshot_price, effective_price)` if the reader has a `paygo_accounts` row; raises `price_changed` if `expected_price` is not the effective price; if the reader already owns the book returns `already_unlocked` with `spent = 0`; otherwise calls `spend_credits(remaining)` with reason `unlock_all`, creates the book entitlement, and revokes nothing (the chapter entitlements stay for history; the book entitlement supersedes them). In one transaction.

**`gift_book(book_id, recipient_id, message, expected_price, key)`**: same checks plus recipient exists, is not blocked, owns nothing of the book; spends the full price with reason `gift`; creates the recipient's book entitlement and a `gifts` row; queues the push.

**`tip_author(book_id, credits, note, key)`**: credits must be one of 20, 50, 100 (config `tip_presets`); caller is not the author; spends with reason `tip` and author earning; inserts `tips`.

**`get_book_page(book_id) → json`**: book, effective price, chapters count and per-chapter average, pages, rating stats, top review, entitlement summary (`owns_book`, `paid_credits`, `remaining`), reader progress, balance, subscription state, `saved`, `following`, first-page `related`. One round trip so the page renders at once.

**`post_review`, `delete_review`, `toggle_review_like`, `hide_reviewer`, `report_review`**: owner checks; `post_review` enforces the 95% rule and length limits.

**Credit packs** and plan state come from flow 09 (`get_credit_options`). Chapter decryption keys and downloads (`request_download`, `/keys`) are Cloudflare Worker endpoints owned by flow 04; they only trust the entitlements these RPCs write. All money logic stays in Postgres RPCs; there are no Supabase Edge Functions and no Realtime in this flow (the book page refetches on focus).

**Rate limits:** `unlock_book`, `gift_book`, `tip_author`: 10 per minute per user (config).

**Notifications:** gift received (push to recipient), tip received (push to author). Both through the notification queue (flow 15).

## Admin side
Prototype ids `book` (Details tab), `book-access`, `book-stats`. The Books list, revisions, review and publish screens are in [12-book-pipeline.md](12-book-pipeline.md).

1. **Book detail** (`book`): description, genres, author, status, current revision, Discover placement (every shelf the book sits on, read-only here; edited in flow 02 curation). Tabs: Details, Revisions, Pricing and access, Stats. Editing details or replacing the cover creates a new revision (flow 12).
2. **Pricing and access** (`book-access`):
   - Shows the computed price with its working: words, standard pages, price = ceil(pages ÷ 2), the pay-upfront and pay-as-you-read split, and the chapter price table (including parts).
   - **Override price**: a number and a mandatory reason. Roles: Super admin and Finance only, with the two-step code re-prompt. A confirm modal states the old and new price and how many readers are mid pay-as-you-read. Calls `admin_set_book_price`, which writes `book_price_history`, recomputes `chapters.price_credits` for the live revision (the Worker computes the allocation with `packages/core` and the RPC validates that the chapter prices sum to the new price), and writes `audit_log`. Readers who already unlocked keep access. Readers mid pay-as-you-read pay at most `new price − paid`.
   - **Override preview**: 5% to 25% with a mandatory reason, Publisher or Super admin. Triggers a preview rebuild job (flow 12); the new preview cut is live only when the job finishes. Readers who already read further are not affected.
   - Remove override: returns to the computed price, also logged.
   - **Price history** table (date, who, old, new, reason) so Support can explain why a reader paid a different price.
3. **Book stats** (`book-stats`): readers, drop-off by chapter (from `reading_progress.max_chapter`), unlocks split upfront vs pay as you read, average credits paid by pay-as-you-read readers, credits spent, tips, author earnings (credits spent × ₦1.60, undone chapter charges excluded). The current month is marked open until the month closes (flow 13). Numbers come from `credit_ledger` and `reading_progress`, never from a separately maintained counter.
4. Every write above goes through an RPC that writes `audit_log` (who, before, after, reason).

## Analytics
`book_viewed {book_id, source, owned, price}` · `buy_option_tapped {book_id, option: unlock_all|pay_go}` · `unlock_sheet_viewed {variant: whole|paygo|low|nosub}` · `book_unlocked {book_id, price, remaining, mode: upfront|rest}` · `unlock_failed {reason}` · `paygo_started {book_id, auto_unlock}` · `topup_from_unlock {missing, pack}` · `gift_sent {book_id, price}` · `tip_sent {book_id, credits}` · `review_posted {book_id, stars, spoiler, has_text}` · `review_reported` · `reviewer_hidden` · `discussion_locked_tapped {percent}` · `download_requested {book_id, scope}`.

## Done when
- [ ] On a real Android phone on a throttled network: open a book, see price and balance, unlock all, balance drops by exactly the price once even with a double tap and with airplane mode toggled mid-request.
- [ ] Pay as you read start, low-balance, no-plan, gift and tip sheets each show the correct state and amounts for seeded readers (Ngozi with 840 credits, a reader with 40, a reader with no plan).
- [ ] Gift arrives in the recipient's Saved shelf with a push; tip appears in the author's earnings rows.
- [ ] Reviews: a non-finisher is blocked by the server; rating is identical on book page, reviews and About.
- [ ] Admin: price override and preview override work, are logged, and Support can read the price history.
- [ ] Offline, large text (200%) and all four themes checked on the book page and every sheet.
- [ ] **pgTAP:** `spend_credits` (no negative balance, replay by key returns same row, concurrent spends serialise); `unlock_book` (price_changed, already_unlocked, remaining after chapter payments, atomic ledger + entitlement); `gift_book`; `tip_author` (presets only, not own book); RLS on `credit_ledger`, `entitlements`, `reviews` (95% rule); no direct INSERT/UPDATE/DELETE by `authenticated` on ledger and entitlements; `admin_set_book_price` role check and history row.
- [ ] **Vitest:** price from pages, pages from words, balance-after maths, "k chapters covered" calculation, top-up pack selection.
- [ ] **Maestro:** one happy path: sign in, open Harmattan Letters, Unlock all, reader opens past 10%.
- [ ] No webhook tests apply here (flow 09 owns them).

## Not in this flow
Buying credits and plans (flow 09). The reader and chapter charging (flow 04). The group discussion itself (flow 06). Author pages (flow 08). Refunds and Support's return of a chapter charge (flows 09 and 14). Discover curation (flow 02).

## Open questions
- Who may post a review: finishers only (assumed, from the prototype's "you finished it on 10 November"), or anyone who has unlocked something?
- Who may override a price: Super admin and Finance (assumed). Should Publishers be able to propose one?
- Spending leftover credits without a plan is allowed (assumed). Confirm with the credits policy in flow 09.
- Gift to a person who has paid for some chapters is blocked (assumed). Alternative: credit the sender the difference.
- Tip presets only (20, 50, 100). Is there a daily tip cap?
- Plans in the prototype copy say "from ₦700 a month" (Yearly per month). README plan table shows Monthly ₦900. Copy must come from plans config.
- "Readers also loved" ranking is co-finish counts (assumed); flow 02 may own a better recommender.
