# Flow 12 · Book pipeline and catalogue

**Build order:** 3 · **Depends on:** flow 01 (staff roles), flow 16 (config, audit log; thin version built with flow 01) · **Prototype:** no reader screens. App side is Author Studio `s-studio-submit`, `s-studio-processing`, `s-studio-chapters`, `s-studio-preview`, `s-studio-submitted` (built in [11-author-studio.md](11-author-studio.md)). Admin screens `books`, `books-sentback`, `book-processing`, `book-formatter`, `book-changes`, `book-preview`, `book-sendback`, `book-approve`, `book-revisions`, `book-unpublish`, `book-new` (area 3). Book detail, Pricing and access and Stats are in [03-book-page-unlock.md](03-book-page-unlock.md).

## Goal
A manuscript becomes a published, priced, encrypted book that opens in the reader, with almost no staff time. The author's phone converts, a Cloudflare Worker verifies and seals, and staff only touch exceptions. Updates to a live book go out in minutes through a fast lane and never break readers' highlights.

**Success looks like:** 90% of Word and EPUB submissions reach Ready for review with no staff fix; median staff time per approved book under 5 minutes; 100% of published books pass the reader contract checks in "Done when".

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Books (Needs you) | `books` | Queue: Needs fixes and Ready for review, readiness, waiting time, who is on it |
| Books: Sent back | `books-sentback` | Books waiting on authors; Remind |
| Processing | `book-processing` | Books being checked or with the staff desk; six steps and time left |
| Fix flagged issues | `book-formatter` | Resolve system flags; decision bar |
| Send back to author (from Fix) | `book-changes` | Issue list filled from flags |
| Quick review | `book-preview` | 8 checks, three phone pages, cover, metadata; decision bar |
| Send back from Quick review | `book-sendback` | Issue list starts empty |
| Approve and publish | `book-approve` | Publish now or schedule; one push to followers |
| Revisions | `book-revisions` | Every revision, fast-lane status, side-by-side diff, audit |
| Unpublish book | `book-unpublish` | Reason, what happens to existing readers, confirm |
| Upload a book | `book-new` | Staff upload on behalf of an author |
| Author side | `s-studio-submit` … `s-studio-submitted` | Flow 11 screens; this flow defines what runs behind them |

## Behaviour

### A. Stages and ownership
1. A revision has exactly one status: `draft` (author working; sub-step `upload|converting|checking|chapters|preview`), `processing` (system working), `with_desk` (waiting for the staff desk), `needs_fixes`, `ready_for_review`, `sent_back`, `scheduled`, `live`, `superseded` (replaced by a newer live revision), `unpublished`, `taken_down`, `rejected`. Author wording is mapped in flow 11. Only RPCs change status; clients never write it.
2. A book has at most one `live` revision (`books.current_revision_id`). Readers get that revision until another one is published; publishing swaps the pointer in one transaction.
3. Promises: Needs fixes within 2 days of routing; Ready for review within 3 days of submission; With the desk within 2 days. Late items turn orange in the queue, and an hourly job alerts the role (Publisher for review and fixes, Operations admin for the desk).
4. "On it": opening Fix or Quick review sets `assigned_to` if empty; the assignee is shown in the queue; assignment lapses after 24 h without activity.

### B. Author upload, on the phone (packages/convert)
5. Studio step 1 collects manuscript, cover and details. `POST /books/upload` (Worker, user JWT) calls `create_revision(book?, meta)`, creates the revision as `draft`, and returns R2 signed upload URLs (15 minutes) for source, cover and, after conversion, the converted package. Files over 5 MB use R2 multipart so a dropped connection resumes. Limits: source 50 MB for Word and EPUB, 100 MB for PDF; cover 10 MB.
6. **On-device conversion** (step 2) runs in `packages/convert` inside the app:
   - Word: mammoth.js to HTML. EPUB: unpacked and parsed with the foliate-js parser. Both then go through one normaliser.
   - Normaliser: strip scripts, inline styles, fonts, colours, empty paragraphs; straight quotes to smart quotes, hyphen runs and spaced dashes to the right dash; scene breaks (`* * *`, `***`, `---`, `###`, centred symbols, runs of blank lines) become one scene-break element; images capped at 1,600 px on the long side and recompressed.
   - Structure: chapters from heading styles first, then "Chapter N", "N.", Prologue and Epilogue patterns; front matter (title page, copyright, dedication, contents, epigraph) detected; table of contents rebuilt.
   - Counts: words, standard pages, length, price, parts, preview cut, as **hints for the author's screen** ("Readers pay 125 credits").
   - Output: a normalised EPUB3 and a draft manifest.
7. The app caps on-device conversion at 300,000 words and falls back to uploading the original for server-side checking (the desk) when conversion errors, runs out of memory, or the file is bigger. PDF is never converted on the phone (see section D).
8. If the app closes during conversion, it resumes from the saved source file. Uploads resume. After upload the app calls `POST /books/finalize {revision_id, sha256 per file}`.

### C. Verification Worker (authoritative)
9. `finalize` checks that the objects exist and match size and hash, sets status `processing`, and enqueues pgmq `book_verify` `{revision_id, stage:'verify', generation}`. The Worker processes the message in the same request with `waitUntil`; a Cron Trigger every minute also reads `book_verify` (visibility timeout 10 minutes) as the safety net. Messages are archived on success and dead-lettered after 3 failed attempts (status `with_desk`, reason `worker_failed`, staff alert).
10. **Nothing from the phone is trusted.** The Worker treats the uploaded package as hostile input:
    - zip safety: max 5,000 entries, max 300 MB expanded, no path traversal, no nested archives;
    - **sanitise every HTML file** with an allowlist (headings h1–h3, p, em, strong, i, b, u, blockquote, ul, ol, li, br, hr, img, figure, figcaption, span and div with class from a fixed set, anchors only to internal ids); drop scripts, event handlers, styles, iframes, forms, external links and every remote resource (http, https, data other than the image allowlist, file); images only jpeg, png, webp, gif, re-checked by magic bytes;
    - rebuild the package from the sanitised content with a fixed template (the book is regenerated, never repackaged), so structure is valid by construction.
11. **Authoritative numbers** are recomputed by the Worker with `packages/core` (the same code the phone uses): words, standard pages, price, chapter list, parts, preview cut, paragraph ids. Where phone and Worker disagree, the Worker's values replace the phone's and the screen shows them. Disagreement above 3% of words is logged as `convert_drift` for engineering.
12. **Counting rules** (`packages/core`, unit tested):
    - A word is a run of letters or digits (hyphenated words count once; em dashes separate words). Front matter and the table of contents are not counted; everything else is.
    - Standard page = 250 words. A full-page image is an image alone in its block and at least 800 px on its long side; each counts 1 page. Small inline images count 0.
    - `pages = ceil(words ÷ 250) + full_page_images`. **Price = ceil(pages ÷ 2)** credits (1 credit = ₦3, author earns ₦1.60 a credit). Examples: 62,400 words gives 250 pages and 125 credits; 71,480 words gives 286 pages and 143 credits. Minimum price 1 credit.
13. **Parts.** A chapter longer than 20 standard pages (5,000 words), and a book with no chapters, is split into parts at paragraph ends. For a chapter of W words: `n = ceil(W ÷ 5000)` parts of roughly equal size; each cut goes to the paragraph end nearest the ideal point, preferring a scene break within ±15% of it; a part under 750 words is merged into its neighbour. A book with no chapters is split the same way and the parts are titled "Part 1", "Part 2". Parts are rows in `chapters` with `kind='part'` and the same title as their chapter plus "· part n". Authors may rename or merge in Studio; a merge that exceeds 20 pages is split again automatically.
14. **Chapter prices.** Chargeable chapters are those not entirely before the preview cut (the chapter holding the cut is chargeable). Each gets weight = its exact pages (words ÷ 250 plus full-page images). Shares are `price × weight ÷ Σ weight`, floored, with the leftover credits given one each to the largest fractional parts (ties go to the earlier chapter), so **the sum equals the book price exactly**. Chapters entirely inside the preview get 0. The Worker computes this in `packages/core` and calls `set_chapter_prices(revision_id, prices)`, which only validates (all non-negative, sum equals `price_credits`, free chapters are 0) and writes. A chapter priced 0 by rounding is granted with no ledger row (flow 04).
15. **Preview cut** targets 10% of counted words (override 5% to 25%, flow 03). The cut is the paragraph end nearest the target. If the cut falls within the last 150 words or last 5% of a chapter, it moves to that chapter's end. It is never before the first paragraph and never beyond 25%. The result is stored as `preview_cut_para_id` and the real `preview_percent`.
16. **Anchors.** Every paragraph gets an id `p_` plus 10 base32 characters and a fingerprint (SHA-1 of lower-cased text with punctuation and whitespace collapsed). New books get fresh ids. For a revision of a live book the Worker aligns paragraphs with the base revision per chapter: (1) exact fingerprint matches in order (longest common subsequence) keep the old id; (2) between matched paragraphs, pairs with at least 60% word 3-gram overlap keep the old id; (3) the rest get new ids. Old paragraphs with no match are recorded in `anchor_migrations` with the nearest preceding matched paragraph. Chapters are matched the same way to keep `chapter_uid` (title similarity plus 60% paragraph overlap); unmatched chapters are new.
17. **Sealing** happens after the author confirms chapters (flow 11 `confirm_chapters`) and submits, and again after any staff fix. For each chapter the Worker writes, per [04-reading.md](04-reading.md) rules A.2 to A.7:
    - `full` file: the chapter XHTML. Encrypted with a **new random 256-bit chapter key** (AES-256-GCM, 12-byte random IV, file layout `IV | ciphertext | tag`, additional data `revision_id:path`).
    - `free` file where there is any free content: whole chapter (before the cut), up to the cut paragraph (the cut chapter), or the peek (later chapters): heading plus opening paragraphs to the first paragraph end after 300 words, capped at 40% of the chapter and never the whole chapter. Encrypted with the revision's **preview key** `K_free`. A free file is an exact structural prefix of its full file (same elements, ids and order); this is asserted in a test.
    - images used by a chapter, encrypted with that chapter's key (or `K_free` for free chapters); package files (container, OPF with one spine item per chapter, nav, stylesheet) encrypted with `K_free`.
    - `manifest.json` (plaintext, no text content): schema version, book id, revision id, total words, pages, price, preview cut (`chapter_uid`, `para_id`, percent), cipher info, and per chapter `{chapter_uid, ord, kind, parent_ord, title, words, words_before, pages, price_credits, free_file, full_file, images, paragraphs: [{id, words_before}]}`.
    - covers in sizes 120, 240, 480, 960 px wide as JPEG.
    Chapter keys are stored in `chapter_keys` wrapped by the master key held in Worker secrets; nothing in the database, R2 or logs ever holds a plaintext key.
18. R2 layout: `src/{rev}/` uploads (private); `work/{rev}/v{n}/` the sanitised plain working copy (private, Worker and signed staff or author preview only, kept for diffs and fixes); `books/{rev}/g{generation}/` sealed encrypted artefacts; `cover/{rev}/` covers. A re-run writes a new generation prefix and swaps the pointer in `complete_seal` only if the generation is still current, so reruns and duplicate queue messages are harmless.
19. The author's preview (Studio step 4) and staff Quick review render the **plain working copy** with the same reader bundle in preview mode, loaded through a short-lived signed URL, so the pages shown are exactly what the reader gets. No keys are involved.

### D. Staff desk (PDFs and anything that failed)
20. A revision goes to `with_desk` when the source is PDF, when on-device conversion failed or was skipped, or when Worker verification failed after retries. It enqueues pgmq `book_desk` `{revision_id, reason, source_key}`. The author sees "With the Arpedia team" and, for PDFs, the plain warning from flow 11.
21. **Desk CLI** (`tools/desk`, runs on staff computers with pandoc, poppler and epubcheck installed):
    - `desk login` signs in as staff (Supabase Auth, staff role, two-step code).
    - `desk pull` claims the oldest job with `desk_claim(revision_id)` (sets `desk_claimed_by`, 2-hour lease, heartbeat every minute; an expired lease returns the job to the queue).
    - It downloads the source through a Worker signed URL, converts (Word and EPUB with pandoc; PDF with poppler text extraction plus layout heuristics: join hard-wrapped lines, remove running headers and footers and page numbers, de-hyphenate, detect headings by font size), runs the same `packages/convert` normaliser, runs **epubcheck** and saves its report.
    - A PDF with no text layer (scanned) is rejected automatically with `desk_reject_unreadable`: the revision goes to `sent_back` with the plain message "We could not read this file. Please send the Word version." Staff are not asked. Same for corrupt or password-protected files.
    - `desk push` uploads the converted package and the epubcheck report through the same `/books/finalize` verification path as a phone upload. epubcheck errors become flags; epubcheck never runs inside the Worker, which does structural checks only.
22. After verification the revision returns to the author for chapter confirmation (push "Chapters are ready"), exactly as for a phone upload, except that PDF-sourced books carry `low_structure_confidence` and `pdf_source` flags.
23. If staff cannot make a file work they use Send back with a note. Desk jobs older than 2 days alert Operations admin.

### E. Checks, flags and readiness
24. Checks run in the Worker on every verify and rescore (the desk adds `file_check_error` from epubcheck). Each failure creates a **flag**: key, severity, plain-language message, suggested fix, location (`chapter_uid`, `para_id`), and whether it can be auto-fixed. The same text appears in Studio, the Fix screen and the Send back list. Default weights (editable in Settings, flow 16; changes audit-logged; a missing key falls back to the default):

| Check | Flag key | Weight | Blocking | Auto-fix |
|---|---|---|---|---|
| File structure (Worker) or epubcheck (desk) | `file_check_error` | 0 | Yes | No |
| Chapters could not be detected | `chapter_detection_failed` | 0 | Yes | No |
| Plagiarism similarity over 30% | `plagiarism_high` | 0 | Yes | No |
| Plagiarism 10% to 30% | `plagiarism_medium` | 15 | No | No |
| Content policy hit | `policy_hit` | 0 | Yes | No |
| Content policy borderline | `policy_borderline` | 10 | No | No |
| Under 1,000 words | `too_short` | 0 | Yes | No |
| Image over 2 MB or over 1,600 px | `image_too_large` | 5 each, cap 15 | No | Yes (shrink) |
| Cover under 800 px wide | `cover_too_small` | 8 | No | No |
| Cover aspect outside 0.55 to 0.70 | `cover_aspect` | 5 | No | No |
| Chapter title unclear or missing | `chapter_title` | 4 each, cap 12 | No | Suggested |
| Repeated text (two paragraphs or more repeated across a chapter boundary) | `repeated_text` | 10 | No | Suggested |
| Copyright page missing | `copyright_missing` | 6 | No | Yes (generated from details) |
| Chapter count differs from contents list | `toc_mismatch` | 8 | No | Suggested |
| Source is PDF | `pdf_source` | 10 | No | No |
| Low structure confidence | `low_structure_confidence` | 10 | No | No |

25. **Score** = max(0, 100 − sum of weights of open flags, each check capped as shown). Recomputed on every flag change. Plagiarism and content-policy checks call provider adapters with a 20 s timeout; on timeout or provider error the check is recorded `skipped`, does not block, and Operations admin is alerted (Open questions).
26. **Routing** when the author submits (and when staff release): score at least 90 and no open blocking flag gives `ready_for_review`; otherwise `needs_fixes`. Open non-blocking flags remain visible in Quick review. The author cannot submit while a blocking flag is open (Studio shows what remains).
27. **Author-side fixes** before submit: re-uploading a corrected file replaces the draft's source and reruns verification (new generation). After submit the revision is locked.

### F. Needs fixes (`books`, `book-formatter`, `book-changes`)
28. **Books** tabs: Needs you (Needs fixes and Ready for review, count), Processing, Sent back, Live; More: Scheduled, Unpublished, Taken down, Rejected. Columns: book (cover, title, author, file type), stage, readiness (meter, percent, flag count), waiting, on it. Filters: file type, nobody on it, late only, genre. Search by title or author. New book button.
29. **Fix flagged issues:** shows the book header (words, pages, status, waiting), the flag list ("3 things to fix"), the location in the text for the active flag, and the decision bar ("Book 1 of 7 in Needs you", Back to queue, Send back to author, Mark fixed and send to review, Skip).
30. **Accept suggestion** applies a fix operation through the Worker `POST /books/fix {revision_id, flag_id}`. Operations are structured and limited: `shrink_image`, `set_heading`, `rename_chapter`, `merge_chapter_up`, `remove_paragraph`, `insert_copyright_page`, `dismiss_flag` (with reason). Each writes a new working-copy version `v{n+1}` and records the inverse; **Undo** restores the previous version. Staff cannot edit free text beyond these operations.
31. After every operation the Worker rescored only the touched chapters (rescore stage) and the readiness meter updates. At score 90 or more with no open blocking flag the primary button reads Mark fixed and send to review.
32. **Mark fixed and send to review** calls `release_to_review(revision_id)`: requires no blocking flag, reseals changed chapters (new keys for them only), sets `ready_for_review`, returns to the queue with a toast and Undo (undo restores `needs_fixes` while no one has opened Quick review). Skip moves to the next book.
33. A PDF-sourced book with many flags (for example 9) should usually be sent back asking for the Word file; the screen suggests it but does not force it.
34. **Send back to author** (`book-changes`): the issue list is filled from the open flags (editable wording, untick to drop); at least one issue or a note is required; optional note.

### G. Quick review, approve, send back (`book-preview`, `book-approve`, `book-sendback`)
35. Quick review (about 5 minutes) shows: a collapsed summary "All 8 automated checks passed" (or the failures), with plain names: Formatting, Chapters, Cover, Preview cut, Paragraph links kept, File check, Plagiarism, Content policy; three phone-framed pages (first page, a middle page, the page at the preview cut) rendered with the real reader in preview mode; the cover as it looks on a phone; metadata (title, genres, description, content notes, age, language); price with its working. A More menu holds Reject.
36. **Send back** (`book-sendback`) from Quick review starts with an empty issue list (no flags) for staff to type what they found; at least one issue or a note. `send_back_revision(revision_id, issues, note)` sets `sent_back`, stores the list, and notifies the author by push and email with the same list shown in Studio. The old revision, if any, stays live.
37. **Approve** (`book-approve`) shows "{words} words → {pages} pages → {price} credits (₦{naira})" and the plain line "Goes live in the app within a minute. {Author} and {n} followers get one push. The book is added to New arrivals for 30 days." More options: Publish now or Schedule (date and time in WAT), price (read-only; overrides are made in Pricing and access), Coming soon (automatic for scheduled), notify followers (on by default).
38. `publish_revision(revision_id, schedule_at, notify_followers)` (Publisher or Super admin; also called by the system for the fast lane) checks: status `ready_for_review` (or fast-lane eligible), no open blocking flag, sealed artefacts present for the current generation, price set and chapter prices sum to price, preview cut valid, caller not the revision's author. Immediate publish, in one transaction: marks the previous live revision `superseded`, sets `books.current_revision_id`, applies `migrate_anchors` (rule 46), sets `new_arrival_until = now + 30 days`, writes `audit_log`, and enqueues the follower push (deduplicated per user and book). Scheduled: status `scheduled`, shown under Coming soon with Notify me; `pg_cron` runs `publish_due()` every minute.
39. **Reject** needs a reason; terminal status `rejected`; author gets push and email. Rejection is for rights or policy, not formatting.
40. Everything staff do writes `audit_log` (who, what, before, after, reason) inside the same RPC.

### H. Revisions, updates and the fast lane (`book-revisions`)
41. Any change to a live book creates a new revision: new file from Studio, Edit details, Replace cover (staff). Metadata-only edits skip conversion but still go through checks. Readers keep the live revision until the new one is published.
42. After seal, the Worker computes a diff against the base live revision: paragraph-aligned, word-level. `changed_words = inserted + deleted`, `changed_pct = changed_words ÷ base words`. It also records chapters added or removed (by `chapter_uid`), whether the cover (hash) and metadata (title, subtitle, description, genres, content notes, age, language) changed, and the author's standing (`author_in_good_standing`: no upheld report or copyright claim in the last 90 days). Result stored in `revision_diffs`.
43. **Fast lane** applies when all hold: `changed_pct < 2%`, no chapters added or removed, cover and metadata unchanged, author in good standing, score at least 90 and no blocking flag. Then `publish_revision` runs with actor `system`, status goes straight to `live`, the diff is logged, and the author gets "Your update is live" (flow 11). Otherwise the revision follows the normal route with a side-by-side diff in Revisions (for example r4 adds an epilogue chapter, so a person reviews it).
44. Every week a `pg_cron` job puts a random 10% of fast-lane publishes (at least 3 if available) into the **audit queue** on Revisions. A Publisher marks each "ok" or "problem". A problem opens a task: staff can revert (`revert_to_revision`, which republishes the previous revision) or send a note to the author; the author is told.
45. **Price on update:** price and chapter prices are recomputed from the new text. Readers who unlocked the whole book keep access to every chapter of every revision at no charge. Readers part-way through pay as you read keep the price they started with (flow 03 `paygo_accounts` snapshot): their remaining charge is capped by the snapshot minus what they paid.
46. **Highlights survive updates.** `publish_revision` runs `migrate_anchors(base_revision, new_revision)` in the same transaction: every `annotations` and `passage_comments` row whose paragraph id was removed is re-pointed to its recorded nearest preceding matched paragraph and flagged `moved`. Matched paragraphs keep their ids, so nothing else changes. The Revisions screen shows "{n} highlights and {m} comments moved". Entitlements point to `chapter_uid`, which chapters keep when matched.
47. The Revisions screen lists every revision (number, status, who, date, change size, fast lane yes or no) with a view of the diff (side by side, changed paragraphs only), the audit queue, and actions for the active revision (Approve update, Send back, Revert).

### I. Processing tab (`book-processing`)
48. Shows each book in `processing` or `with_desk`: cover, title, author, file type, start time, six steps (Received, Converted, Chapters found, Checks, Author confirms, Scored) with the current one highlighted, and time left. Time left = median of the last 50 completed verifications of the same file type, scaled by file size; desk jobs show "With the desk · waiting {n} h". Nobody needs to act. A file that cannot be opened is sent back automatically with a plain message, and the author is told by push and email.
49. Steps are written to `book_revisions.steps` as they complete. The Studio screens poll `get_revision_status(revision_id)` every 3 seconds while open (no Supabase Realtime) and also get a push when chapters are ready.

### J. Sent back, staff upload, unpublish
50. **Sent back** tab lists books waiting on authors with the issue summary and age. A reminder goes automatically after 7 days (once), or staff press Remind (at most one a day). Resubmission creates revision n+1 and returns through Processing; the sent-back revision stays in history.
51. **Upload a book** (`book-new`): staff pick the author, upload file and cover, set title; rights confirmation is required; the upload is logged against the staff member; the author is told by push and email that a book was added. It goes through the same pipeline; staff never format by hand. Description and genres can be filled by the author later.
52. **Unpublish** (`book-unpublish`): needs a reason (Author request, Policy violation, Quality), a decision for readers who already unlocked it (**Keep access** default, or **Remove access**), a toggle to notify readers, and the title typed to confirm. `unpublish_book` removes the book from search, shelves and Trending and sets `unpublished`. Keep access: owners can still read and download (keys keep being issued). Remove access (policy violations only): the Worker stops releasing keys, entitlements are revoked, and paid credits for that book are refunded as `refund` ledger rows. Unpublished books can be republished. Copyright takedowns use flow 14 (`taken_down`, earnings frozen).

## States and edge cases
- **Empty:** Needs you empty shows "All caught up". Processing empty: "Nothing is being converted." Revisions with one revision: "No updates yet."
- **Loading:** skeleton rows in queues; Quick review pages show skeleton phones until the preview renders.
- **Error:** verification failure shows the plain reason to the author (never a stack trace) and an automatic route to the desk; `finalize` hash mismatch asks the author to upload again; Worker timeout is retried by the queue.
- **Offline (author):** uploads pause and resume; submit is disabled until connected (flow 11).
- **Edge cases:**
  - Two staff open the same book: the second sees "{name} is on it" and can take over; writes use a version check so fixes do not overwrite each other.
  - Duplicate `finalize` or queue message: generation check makes the second a no-op.
  - Author uploads while a revision is already in review: the earlier one is closed as `sent_back` with "Replaced by a newer upload" only if the author confirms.
  - Book under 10 pages: the whole book can fall inside the 25% cap and the only chargeable chapter is the last; if no chargeable chapter exists the book is free to read and priced at its computed price for gifting only (Open questions).
  - Image-only or very short chapters price as 0 and are granted free in the reader.
  - Staff fix after seal creates new keys only for changed chapters; readers' existing keys for untouched chapters stay valid.
  - An update that lowers the price: owners unaffected; pay-as-you-read readers capped by the lower of snapshot and new price.
  - Revision published while a reader is mid-session: they finish the open revision (flow 04).
  - Master key rotation: keys are re-wrapped in a background job; clients are unaffected because they never hold the master key.

## Data
Extends the core `books`, `book_revisions`, `chapters`. Foreign keys and RLS are on every table.

**`books`**: `id`, `author_id`, `title`, `subtitle`, `genres text[]`, `description`, `current_revision_id`, `status` (draft, live, scheduled, unpublished, taken_down, rejected), `new_arrival_until`, plus columns from flow 03.
**`book_revisions`**: `id`, `book_id`, `revision_no`, `status` (rule 1), `draft_step`, `source_type` (docx, epub, pdf), `source_key`, `converted_key`, `uploaded_by`, `created_via` (author, staff, desk), `words`, `pages`, `price_credits`, `preview_percent`, `preview_cut_para_id`, `readiness int`, `fast_lane bool`, `generation int`, `artifact_prefix`, `manifest_key`, `steps jsonb`, `assigned_to null`, `submitted_at`, `routed_at`, `due_at`, `desk_claimed_by null`, `desk_lease_until null`, `desk_reason null`, `sent_back_note`, `published_at`, plus content fields from flow 03 (content notes, age, publisher, ISBN, language, file bytes).
**`chapters`**: `id`, `revision_id`, `chapter_uid`, `ord`, `kind` (chapter, part), `parent_ord null`, `title`, `words`, `words_before`, `pages numeric(7,2)`, `price_credits`, `free_file`, `full_file`.
**`chapter_keys`** (service role only): `revision_id`, `chapter_uid null` (null = `K_free`), `wrapped_key bytea`, `key_version`, `revoked_at null`.
**`paragraph_anchors`**: `revision_id`, `para_id`, `chapter_uid`, `ord`, `fingerprint`, `words`, `words_before`. Index on (revision_id, fingerprint).
**`anchor_migrations`**: `base_revision_id`, `new_revision_id`, `old_para_id`, `new_para_id null`, `nearest_para_id`, `method` (exact, fuzzy, nearest).
**`book_flags`**: `id`, `revision_id`, `check_key`, `severity`, `weight`, `blocking bool`, `message`, `suggestion`, `location jsonb`, `auto_fixable bool`, `fix_op jsonb null`, `status` (open, fixed, dismissed), `fixed_by null`, `dismiss_reason null`, `created_at`.
**`book_fixes`**: `id`, `revision_id`, `flag_id null`, `op jsonb`, `inverse jsonb`, `work_version`, `staff_id`, `undone_at null`, `created_at`.
**`send_backs`**: `id`, `revision_id`, `issues jsonb`, `note`, `sent_by`, `source` (fixer, quick_review, desk_auto), `sent_at`, `reminded_at null`.
**`revision_diffs`**: `revision_id`, `base_revision_id`, `inserted_words`, `deleted_words`, `changed_pct`, `chapters_added int`, `chapters_removed int`, `cover_changed bool`, `metadata_changed bool`, `author_in_good_standing bool`, `fast_lane_eligible bool`, `reasons text[]`, `diff_key`.
**`fast_lane_audits`**: `revision_id`, `status` (pending, ok, problem), `audited_by null`, `note`, `audited_at null`.
**`pipeline_config`**: `key`, `value jsonb` (check weights, thresholds and caps), edited through flow 16.
**pgmq queues:** `book_verify`, `book_desk`.

**RLS (plain words):**
- Authors read and update only their own `books` and draft revisions through RPCs; they never write `status`, `price_credits`, `readiness`, flags or chapters directly (flow 11).
- Readers read only the current live revision and its chapters (through `book_effective`, flow 03); never drafts, scheduled books or flags.
- Staff with Publisher or Super admin read all pipeline tables; Operations admin reads status and desk tables; Support reads books read-only. Writes happen only through the RPCs below.
- `chapter_keys`, queue tables and `pipeline_config` secrets are service-role only.
- R2 objects are reached only through Worker-issued signed URLs; source and work prefixes are private.

**Migration from v25:** every v25 book is re-run through the Worker (source files re-uploaded from the v25 store) so it gets the new price, chapters, parts, anchors and encrypted artefacts; books that fail go to the desk. v25 prices by length tier are discarded. Readers' v25 unlocks become entitlements per book (flow 03) and highlights are mapped by quote to new paragraph ids (flow 04); those that cannot be mapped are reported to Support.

## Server
**Cloudflare Worker endpoints** (`workers/api`; the app and admin send the Supabase JWT, staff endpoints also require a staff role and a fresh two-step code):
- `POST /books/upload` (author or staff): `create_revision`, returns signed upload URLs.
- `POST /books/finalize`: verifies objects, sets `processing`, enqueues `book_verify`.
- `POST /books/confirm {revision_id, edits}`: applies renames and merges to the working copy, re-splits long chapters, recomputes the manifest and price (the price changes only if the word count changes), returns them; the RPC `confirm_chapters` records the result.
- `POST /books/submit {revision_id}`: calls RPC `submit_revision` (with the user's JWT; checks blocking flags and confirmed chapters), enqueues `seal`; the status becomes `processing` until sealed, then routing (rule 26) or fast lane (rule 43).
- `POST /books/fix`, `POST /books/release` (staff): rules 30 to 32.
- `POST /books/preview-url` (author of the revision or staff): signed URL for the working copy.
- `POST /desk/claim`, `/desk/source`, `/desk/upload`, `/desk/heartbeat` (staff, used by the CLI).
- Internal: queue consumer for `book_verify` (stages `verify`, `rescore`, `seal`, `diff`), Cron Trigger every minute for stuck messages.
- Key endpoints (`/devices`, `/keys`, `/download`) are in flow 04.

**Postgres RPCs** (SECURITY DEFINER, role-checked, every staff action writes `audit_log`):
`create_revision`, `confirm_chapters`, `submit_revision` (inputs, outputs and checks as in flow 11), `complete_verify(revision_id, generation, result)`, `complete_seal(revision_id, generation, manifest, keys_meta)` (swap pointer only if generation current; writes flags, chapters, anchors, readiness), `set_chapter_prices(revision_id, prices)` (validates sum and non-negative), `release_to_review`, `send_back_revision`, `reject_revision`, `publish_revision`, `publish_due` (cron), `revert_to_revision`, `migrate_anchors`, `unpublish_book`, `republish_book`, `desk_claim`, `desk_reject_unreadable`, `author_in_good_standing(author)`, `get_revision_status`, `book_queue_read` and `book_queue_ack` (service role wrappers over pgmq for the Worker), `remind_author`, `select_fast_lane_audits` (cron), `audit_fast_lane`.
**pg_cron jobs:** `publish_due` every minute; `pipeline_sla` hourly (late alerts by role); `sent_back_reminder` daily; `fast_lane_audit_pick` weekly; `desk_lease_reaper` every 5 minutes.
**Notifications** (via flow 15): processing done and "chapters are ready" (author), sent back (author, push and email, with the issue list), approved (author, push and email), live (followers, one push), "your update is live" (author), late items (staff by role).
No Supabase Edge Functions, Realtime or Storage; no container worker.

## Admin side
Screens above. Roles:
| Role | Can |
|---|---|
| Publisher | Fix, Quick review, Approve, Send back, Reject, Schedule, revisions, audit queue, preview override, upload for authors |
| Super admin | Everything, plus price override, unpublish with Remove access |
| Operations admin | Desk queue, late alerts, Processing tab, retry a stuck job; no approvals |
| Finance | Price override with the two-step code; read-only elsewhere |
| Support | Read-only |
Staff-facing words stay plain ("File check", "Paragraph links kept"); technical names sit in "Technical details" folds. Reversible actions show a toast with Undo; modals only for publish, unpublish, price and sending to many readers.

## Analytics
`book_upload_started {source_type, bytes}` · `convert_completed {ms, words, device_ram_mb}` · `convert_failed {reason}` · `convert_drift {pct}` · `verify_completed {ms, score, flags}` · `routed {to}` · `desk_job {reason, wait_h}` · `fix_applied {op}` · `readiness_changed {from, to}` · `quick_review_decision {decision, minutes}` · `book_published {mode: manual|scheduled|fast_lane}` · `fast_lane_audit {result}` · `send_back {source, issues}` · `revision_diff {changed_pct}` · `anchors_moved {n}`.

## Done when
- [ ] A real Android phone converts a 60,000-word .docx on-device, uploads, and the Worker returns the same page count and price (or corrects it), with chapters shown in Studio.
- [ ] An EPUB, a .docx with no chapters (auto parts) and a PDF each reach the right place: phone path to Needs you; the PDF through `tools/desk` to chapter confirmation; a scanned PDF is sent back automatically with the plain message.
- [ ] Hostile input test: a DOCX or EPUB containing script, event handlers, external images and a zip-slip path comes out sanitised or rejected; nothing remote is referenced in sealed files.
- [ ] Sealed book opens in the reader: free files readable with `K_free` alone, a locked chapter unreadable without its key, preview ends at the cut paragraph, chapter prices sum to the book price.
- [ ] Needs fixes: accept suggestion, Undo, rescore, release to review; Quick review shows three real phone pages; Send back reaches the author by push and email with the same list; Approve publishes within a minute; Schedule shows under Coming soon and publishes on time.
- [ ] Fast lane: a 1% edit publishes with no staff step; adding a chapter, changing the cover or an author with an upheld claim does not; the diff and audit entry exist.
- [ ] Update with edited paragraphs: highlights and passage discussions on unchanged paragraphs stay put; removed paragraphs move to the nearest one and are counted on Revisions.
- [ ] Duplicate `finalize` and duplicate queue delivery produce one set of artefacts; a killed Worker mid-seal leaves the old generation intact.
- [ ] Unpublish with Keep access keeps keys flowing to owners; Remove access stops them and refunds.
- [ ] All admin screens checked at 1280 px and 1024 px with large text; every action writes an audit row.
- [ ] **pgTAP:** `publish_revision` (status and blocking-flag guards, author cannot publish own book, atomic pointer swap, anchors migrated, idempotent); `complete_seal` generation guard; `set_chapter_prices` invariants; `release_to_review`; `unpublish_book` with refunds writes ledger rows; RLS: readers cannot see drafts, scheduled revisions, flags or `chapter_keys`; authors cannot write status or price; staff role matrix.
- [ ] **Vitest:** word counting, standard pages, price, chapter price allocation (sum equals price, ties, free chapters), part splitting, preview cut placement, peek rule and free-file prefix property, readiness score and routing, fast-lane eligibility, paragraph alignment and `chapter_uid` matching, sanitiser allowlist, manifest schema, AES-GCM seal and open round trip.
- [ ] **Maestro:** one happy path: Studio submit of a seeded .docx to the Submitted screen (admin approval is a seeded staff API call), then the book page shows the computed price.

## Not in this flow
Author Studio screens and application flow (flow 11). Reader and key delivery to devices (flow 04). Price override and book stats (flow 03). Copyright claims and takedown decisions (flow 14). Discover curation, genres and search tuning (flow 02). Author earnings (flow 13). Audio books, translations, DRM beyond per-chapter encryption, bulk import tooling beyond the v25 migration.

## Open questions
- Plagiarism provider, cost per check, and its behaviour when down (default: skipped, not blocking).
- Content-policy classifier provider (default: adapter with a moderation model; hits are blocking).
- Keep accepting PDF at launch (default yes, through the desk) or Word and EPUB only.
- Fast-lane threshold: 2% of words (default) or a fixed word count.
- Routing: "90% with no blocking flags" (default, from the pipeline doc) or "90% with no flags at all" (admin prototype note). Which?
- Counting: are acknowledgements and "About the author" counted (default yes) or excluded with front matter?
- Image shrinking in the Worker needs Cloudflare Images; default is the Images binding with an author-side flag if it is unavailable.
- Remove access on unpublish refunds paid credits (default). Confirm, including the author earnings reversal.
- Pay-as-you-read readers keep the price they started with on updates (flow 11 rule 26); flow 03 stores a `paygo_accounts` snapshot to do so. Confirm.
- Books where the preview covers every chargeable chapter (under about 10 pages): treated as free to read with gifting only. Confirm.
- Desk hours: the desk only works when a staff computer is on; confirm the 2-day promise and who owns it.
- Whether epubcheck should also run in CI over sealed fixtures (default yes) since it does not run in the Worker.
