# Flow 11 · Author Studio

**Build order:** 8 · **Depends on:** flow 1 (sign-in), flow 12 (book pipeline), flow 9 (credits and ledger) · **Prototype:** app screens `s-become-author`, `s-apply`, `s-apply-2`, `s-apply-3`, `s-apply-4`, `s-apply-sent`, `s-studio`, `s-studio-profile`, `s-studio-books`, `s-studio-submit`, `s-studio-processing`, `s-studio-chapters`, `s-studio-preview`, `s-studio-submitted`, `s-studio-post`, `s-studio-inbox`, `s-studio-royalties`, `s-studio-payout`, `s-studio-community` (data-flow 11); admin screens `s-authors`, `s-applications`, `s-application`, `s-application-info`, `s-author`, `s-author-payout`

## Goal
A reader can apply to become an author, and an approved author can publish and update books, see what they earn, and manage their public profile from one place, without staff formatting anything by hand. Conversion and review internals live in [12-book-pipeline.md](12-book-pipeline.md); this flow is the author-facing and staff-facing surface around them.

**Success looks like:** 80% of approved authors submit a first book within 14 days; median time from application to decision under 3 days; 90% of submissions pass automated checks without a staff fix.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Become an author | `s-become-author` | Pitch, earnings (₦1.60 per credit), what to have ready, Start application |
| Application 1 to 4 | `s-apply`, `s-apply-2`, `s-apply-3`, `s-apply-4` | Profile, writing, sample, review and send |
| Application sent | `s-apply-sent` | What happens next and by when |
| Author Studio | `s-studio` | Home: stats, approval banner, quick actions, earnings per book, shortcuts |
| Author profile settings | `s-studio-profile` | Pen name, bio, photo, location, visibility, reader preview |
| My books | `s-studio-books` | Every book with status and next action |
| Submit 1 to 5 | `s-studio-submit`, `s-studio-processing`, `s-studio-chapters`, `s-studio-preview`, `s-studio-submitted` | Guided submission |
| Earnings | `s-studio-royalties` | This month's earnings, upfront vs pay as you read, payout history |
| Payout account | `s-studio-payout` | Bank account and verified name (details in flow 13) |
| Post an update | `s-studio-post` | Post to followers and the author's club |
| Reader messages | `s-studio-inbox` | Waiting messages first; replies are free |
| Club settings | `s-studio-community` | Who can post, slow mode |
| Authors, Applications (admin) | `s-authors`, `s-applications` | Lists with payout status and review queue |
| Application, Ask for info (admin) | `s-application`, `s-application-info` | Review and decide |
| Author, Payout account (admin) | `s-author`, `s-author-payout` | Author profile, earnings by month, payout hold |

## Behaviour
**Become an author and apply**
1. `s-become-author` is reachable from Profile and the Studio entry for non-authors. It states: ₦1.60 for every credit readers spend; a 250-page book is 125 credits so a full read pays ₦200; have ready a short bio, a writing sample (up to 10 pages) and bank details; about 10 minutes; review about 3 days.
2. The application has 4 steps: (1) full name, email, phone (optional), pen name (optional), social handle (optional); (2) categories (chips: Christian fiction, Clean romance, African stories, Poetry, Devotionals, Non-fiction, Short stories), short bio (max 300 characters with counter), writing experience; (3) writing sample, a file (.docx or .pdf, up to 10 pages) or pasted text; (4) review with Edit links, rights and terms checkbox, **Send application**.
3. Name and email are prefilled from the account. No validation error appears before the user types (**Fixed** from v25).
4. Drafts save as the user types (debounced, 1 second) and also by **Save draft**. Returning later reopens the draft at the step left off. Cancel keeps the draft; a draft older than 90 days is deleted.
5. The sample file is uploaded to R2 by signed URL, checked on upload (type, size up to 5 MB, page count shown) and stored with the application. **Fixed:** v25 never stored the file.
6. Send is blocked until step 1 required fields, at least one category, a sample and the checkbox are done. The checkbox text states the ₦1.60 earning and that the author owns the rights. Sending stores the accepted agreement version and time.
7. `s-apply-sent` shows the sent date and the reply-by date (the SLA below), and that the user will get a notification either way. A user with an application waiting cannot open a second one; the Start button shows the status instead.
8. Review (staff): Approve, Ask for info, or Reject. Review SLA is **5 days** (admin promise); the app says "about 3 days" (typical). Open question 2.
9. Approve: sets `profiles.is_author`, creates the author profile and the author's community channel (club), pushes and emails the author, and shows an approval banner on the Studio home (not a system popup). Ask for info: author gets a push, the application returns to step 3 or the named step with the staff question; they answer and resubmit, which restarts the SLA clock. Reject: author gets the reason; reapply is allowed after 30 days if staff allowed it.
10. Automated checks run when the application is sent and are shown to the reviewer as one line: email verified, phone verified, duplicate account, sample similarity, age 18 or over. A failed check never auto-rejects; it highlights the row.

**Studio home (`s-studio`)**
11. Shows, for the current calendar month: published books, minutes read, followers, and earnings (credits spent on the author's books, tips and messages × ₦1.60). The earnings figure equals the sum on `s-studio-royalties`. **Fixed** from v25 (reads and earnings disagreed).
12. Earnings per book lists each live book with credits spent and ₦ earned. Shortcuts show waiting private messages, club members, My books counts, new comments, next payout date and amount, payout account status, and club settings.
13. A reader-mode switch returns to the reader app shell; the author never loses reader features.

**My books (`s-studio-books`)**
14. Each book shows a status and one next action. Statuses (author wording over pipeline stages): Draft ("Confirm your chapters and submit when ready"), In review, Changes requested (shows the editor's issue list and **Upload new file**), Live, Scheduled, Unpublished, Taken down (read-only, reason shown, earnings frozen).
15. An update to a live book shows "Update v2 in review · readers still see v1". Readers keep the approved revision until the new one is approved.
16. A taken-down or rejected book cannot be updated; the author sees how to appeal (link to flow 14).

**Guided submit (5 steps)**
17. Step 1 `s-studio-submit`: upload manuscript (Word recommended, EPUB fine, PDF allowed with a plain warning "slower, often sent back"), cover (JPG or PNG, best 1600 × 2560, portrait), title, subtitle (optional), up to 3 genres, description. Continue is enabled when file, cover, title, at least one genre and description are present.
18. Step 2 `s-studio-processing`: **conversion happens on the author's phone first.** Word (.docx) is converted with mammoth.js and EPUB is unpacked and cleaned in JavaScript on the device; the screen shows live progress (reading your file, cleaning text and quotes, finding chapters, building the 10% preview). The converted book and cover then upload to R2, and a Cloudflare Worker re-verifies it on the server (sanitise, recount words, price, split long chapters, encrypt each chapter with its own key). The screen then shows **Checking your book**, normally under a minute. The author can leave; a push says "Chapters are ready". Phones that cannot convert (very low memory, conversion error) fall back to uploading the original for server-side checking. Internals: [12-book-pipeline.md](12-book-pipeline.md).
18a. **PDF** is not converted on the phone. It is sent to the Arpedia team, who process it on a staff desk with a local tool. The screen says plainly "PDFs are sent to our team. This takes longer and is more likely to be sent back"; the book shows as In review with no chapter step until staff finish, and the author gets a push when chapters are ready to confirm. Any file that fails on-device conversion and server re-verification goes to the same desk.
19. Step 3 `s-studio-chapters`: lists detected chapters with word counts and plain-language flags. The author can rename, add a missing title, and merge a chapter up. Chapters over about 20 pages, and books without chapters, are split into parts automatically; the screen tells the author readers pay for them in smaller steps.
20. Step 3 shows: total words, standard pages (250 words each, full-page image = 1), and **Readers pay N credits (₦X)**. Price is set by length, not by the author (half a credit per page, rounded up). Every merge or rename recomputes the manifest but not the price unless the word count changes.
21. Step 4 `s-studio-preview`: swipe through the first page, a middle page and the point where the free preview ends (10%); readiness score; checklist (file read, chapters confirmed, preview built, cover, open flags); price; "You earn per full read ₦200"; rights checkbox. **Submit for review** is disabled while any blocking flag is open and shows what remains.
22. Step 5 `s-studio-submitted`: celebration, review time ("within 3 days; most reviews take 5 minutes"), price and earning line, what happens next (Submitted, Review, Approved or sent back, Published and followers notified).
23. Leaving mid-way keeps the book as a Draft with the upload; My books shows "Continue" at the right step. Closing the app during on-device conversion pauses it and resumes from the saved file; closing it during the server check does not cancel the check.
24. The author is told in plain words what is wrong in sent-back issue lists (same text as the pipeline flag messages).

**Updates to a live book**
25. Upload new file on a live book starts a new revision through the same five steps. If the **fast lane** conditions in [12-book-pipeline.md](12-book-pipeline.md) hold (under 2% words changed, no chapters added or removed, cover and metadata unchanged, no upheld report or claim in 90 days), the update goes live after automated checks with no staff step, and the author is told "Your update is live". Otherwise it joins the review queue.
26. Price of a live book is recomputed on update. Readers who already unlocked it keep access; readers part-way through pay as you read keep the price they started with.

**Earnings and payout account (author view)**
27. `s-studio-royalties` shows the month's earnings, split into **Unlock all** (credits and ₦) and **Pay as you read** (credits and ₦), the total as `credits × ₦1.60`, and a plain note: a reader who pays as they read and stops halfway pays half. Own reading and refunds do not count. Minimum payout ₦1,000. Payout history by month with status (Releases 15 Dec, Paid).
28. Earnings accrue the moment a reader's credits are spent (upfront unlock, chapter charge, tip, author message). A chapter returned within the 10-minute undo or by Support is removed. Rules, hold and payout timing: [13-earnings-payouts.md](13-earnings-payouts.md).
29. `s-studio-payout` shows bank, masked account number, verified account name, payout day (15th), method, minimum. **Change account** starts verification and pauses payouts to the new account for 48 hours.

**Profile, posts, inbox, club**
30. `s-studio-profile`: pen name, bio, photo, location, public or private visibility, and a live preview of how readers see the author page.
31. `s-studio-post`: text post to followers and the author's club; optional link to one of their books. Fan-out and moderation follow flow 8 and flow 6 rules.
32. `s-studio-inbox`: waiting messages first, oldest first; replying is free for the author (the reader paid 5 credits). Details in flow 8.
33. `s-studio-community`: real controls for who can post and slow mode (v25 had static rows). Stored on the club row; enforcement in flow 6.

## States and edge cases
- **Empty:** no books: "Submit your first book" with the Submit button and the 3-step summary. No earnings yet: "You will see credits and naira here as readers unlock your books." No messages: "No messages waiting."
- **Loading:** skeletons for stats and book rows. Processing screen shows live progress; if no progress for 30 seconds it shows "Still working. You can leave; we will notify you."
- **Error:** upload failed: file and cover keep their place, "Try again" resumes (R2 multipart). Conversion failed on the phone: the app offers to send the file to the Arpedia team instead. Server check failed: "We could not read this file. Try the Word version" with Upload again; the revision shows `failed` to staff and in the staff desk queue. Submit failed: nothing is lost.
- **Offline:** application drafts and metadata edits queue locally and sync; uploads pause and resume; submit and Send application are disabled with "Connect to send".
- **Edge cases:** suspended author rights hide Submit and tips but live books stay readable and the Studio shows a banner with the reason and contact. Duplicate title by the same author prompts "You already have this book. Update it instead?". Application with a banned email or phone is silently queued as New with the check highlighted. Author tries to buy or unlock own book: blocked in flow 3 (self-reads never earn). Sample file larger than limit or wrong type: plain message, no draft loss. Two devices editing one draft: last save wins per field.

## Data
Extends README `profiles`, `books`, `book_revisions`.

**`author_applications`** `id` · `user_id` · `status` (draft, new, needs_info, approved, rejected, withdrawn) · `step_reached int` · `legal_name` · `email` · `phone null` · `pen_name null` · `social_handle null` · `categories text[]` · `bio text (≤ 300)` · `experience text` · `sample_file_key text null` · `sample_text text null` · `sample_pages int null` · `agreement_version int null` · `agreement_accepted_at null` · `submitted_at null` · `assigned_to null` · `decided_by null` · `decided_at null` · `decision_reason text null` · `reapply_after date null` · `info_request text null` · `checks jsonb` (email, phone, duplicate, similarity pct, age).
**`author_application_events`** `id` · `application_id` · `actor_id` · `kind` (submitted, assigned, info_asked, info_given, approved, rejected) · `note` · `created_at`.
**`author_profiles`** `user_id pk` · `pen_name` · `bio` · `photo_url` · `location` · `visibility` (public, private) · `status` (active, suspended) · `suspended_reason null` · `approved_at` · `club_group_id` (→ `groups`) · `payee_type` (individual, company) · `legal_name` · `payouts_paused bool` · `payouts_paused_reason null`. Payee and payout fields are owned by flow 13.
**`books` / `book_revisions`** (flow 12) additions used here: `books.author_id`, `book_revisions.status`, `revision_no`, `source_type` (docx, epub, pdf), `price_credits`, `readiness`, `flags jsonb`, `fast_lane bool`. `book_drafts` is not a separate table: a revision with status `draft` is the draft.
**`studio_stats_daily`** `author_id` · `day` · `minutes_read` · `reads` · `credits_spent` · `earned_kobo` (optional rollup for the home screen; computed from the ledger).

**RLS:** an applicant reads and writes only their own application while status is `draft` or `needs_info`; after sending they can only read. Staff with the Publisher or Super admin role read all applications and write decisions through RPCs. Authors read and update only their own `author_profiles` columns (pen name, bio, photo, location, visibility); status and payout fields are server-only. Authors read their own books and revisions but cannot change `status`, `price_credits` or `readiness`. Writing samples are in a private R2 prefix with short-lived signed URLs for staff.

**Migration from v25:** import approved authors and their applications (including legal name and agreement acceptance). v25 samples were never stored: set `sample_file_key = null` and mark `legacy = true`. Authors keep followers and existing channels.

## Server
- **`start_application()` / `save_application_draft(patch)`:** RPC; one open application per user; patch only touches allowed columns.
- **`submit_application()`:** validates required fields, stores agreement version, sets `submitted_at`, enqueues `application_checks` job, notifies staff queue.
- **`application_checks` (Cloudflare Worker, queued):** email and phone verified from auth; duplicate search by email, phone and legal name; text similarity on the sample; age from the application (open question 3); writes `checks`.
- **`decide_application(id, decision, reason, info_request, allow_reapply)`:** staff only; Approve runs in one transaction: sets `profiles.is_author`, inserts `author_profiles`, creates the club `groups` row, writes `author_application_events` and `audit_log`; then queues push and email. Ask for info sets `needs_info` and the request text. Reject sets `reapply_after = today + 30` if allowed.
- **`assign_application(id, staff_id)`:** staff only; avoids two reviewers on one item.
- **`studio_home()`:** returns stats, per-book earnings, shortcuts for the signed-in author from the ledger and `reading_progress`. Read-only.
- **Book submit:** `create_revision(book?, meta)` is called through a Cloudflare Worker that returns signed R2 upload URLs; all server TypeScript runs on Workers, Supabase is Postgres (RLS, RPCs, pg_cron, pgmq) and Auth only; `submit_revision(revision_id)` checks readiness blocking flags and chapters confirmed, sets the stage by the pipeline routing rule, and notifies staff. `confirm_chapters(revision_id, edits)` applies renames and merges and returns the recomputed manifest and price. Processing, readiness and fast lane logic are defined in [12-book-pipeline.md](12-book-pipeline.md).
- **`suspend_author(user, reason)` / `reinstate_author`:** Super admin or Support lead; hides new uploads and tips, holds open-month earnings (flow 13), audit log.
- **Cron:** `application_sla` (hourly: flags applications past 5 days late, alerts Publisher role); `draft_cleanup` (daily: drops application drafts older than 90 days and abandoned book drafts with no file after 30 days).

## Admin side
- `s-authors`: list of authors with books live, reads, last cycle earnings, payout account status (only Failed and Not set carry a pill) and community channel link; filters for payout account, genre, earnings. Tab for Applications with the count waiting.
- `s-applications`: queue with filters (All, New, Needs more info, Approved, Rejected), waiting time (orange after 5 days), assignee, assign-to-me. Open the writing sample from R2.
- `s-application`: five steps of answers, sample excerpt with Open full sample, automatic checks summary, reviewer notes, decision bar: Approve, Ask for info, Reject, Skip, Back to queue.
- `s-application-info`: overlay to write the question the applicant will see; sends a push and email.
- `s-author`: header line (followers, reads, last month earnings), books with stage and credit price, earnings by month with status, tips and messages, community block, recent Studio activity. Actions: Message, Edit profile, Download statement, Pause payouts, Suspend author rights.
- `s-author-payout`: bank record, legal name match, payout history, hold, verification history (this screen is detailed in flow 13).
Roles: Publisher reviews applications; Finance sees payout fields; Super admin suspends. Every decision writes `audit_log`.

## Analytics
`author_cta_viewed` · `application_started` · `application_step_completed {step}` · `application_draft_saved` · `application_sent` · `application_decided {decision, days}` · `studio_opened` · `book_submit_started {source_type}` · `book_processing_done {seconds, flags}` · `chapters_confirmed {merged, renamed}` · `book_submitted {price_credits, readiness}` · `book_update_submitted {fast_lane}` · `studio_earnings_viewed` · `author_post_created`.

## Done when
- [ ] On a real phone: apply as a new user (all 4 steps, draft survives killing the app), staff approves in admin, author sees the approval banner and the Studio.
- [ ] Author converts a .docx on a low-end phone (on-device, then "Checking your book"), uploads a PDF that goes to the staff desk, confirms chapters (rename and merge), previews, submits; the book appears in the staff queue with the same flags the author saw.
- [ ] A small update to a live book goes live through the fast lane; a large one goes to review; readers keep v1 until approval.
- [ ] Studio home earnings equal the earnings screen and the admin author page for the same month.
- [ ] Staff: assign, Ask for info (author sees question and replies), Reject (reapply date shown), Approve.
- [ ] pgTAP: RLS on `author_applications` (applicant sees own only; cannot edit after send; staff roles); `decide_application` creates author profile and club in one transaction and cannot approve twice; `author_profiles` client cannot write status or payout fields.
- [ ] Vitest: price from words and images (pages ÷ 2, ceil), chapter split into parts, per-read earning (price × ₦1.60).
- [ ] One Maestro path: apply, then (seeded as approved) submit a book to the Submitted screen.

## Not in this flow
- Conversion, readiness scoring, publish, staff Quick review: flow 12.
- Earnings cycles, payouts, bank verification, statements: flow 13.
- Author public page, follow, direct messages and tips from the reader side: flow 8. Community and club behaviour: flow 6.
- Co-authors, agents or publishers as accounts, ISBNs, print, translations, scheduled launches chosen by the author (staff schedule today).

## Open questions
1. Which file types are accepted for the writing sample (.docx and .pdf assumed) and the size limit (5 MB assumed)?
2. Review promise: the app says about 3 days, admin says 5 days. Default: promise 5 in admin, "about 3 days" in copy until real data.
3. Age check: the admin application shows date of birth and state, but app steps 1 to 4 do not collect them. Add to step 1, or drop the age check? Default: add date of birth (never public) and state to step 1.
4. Admin application has a 5th step (payout and agreement) while the app has 4: payout details are collected after approval in the Studio. Confirm.
5. `s-studio` shows "Minutes read" while its note and admin show "reads". Default: minutes read on the Studio, reads in admin.
6. Plagiarism provider and cost per sample (see pipeline open questions).
7. Can an author delete a book? Default: no. They can unpublish; readers keep unlocked copies.
8. Author statement download for authors themselves (admin has it; Studio has no button). Default: add to `s-studio-royalties` in flow 13.
