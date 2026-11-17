# Book pipeline (rebuild)

How a manuscript becomes a book readers can open in the app. This replaces the v25 flow, where staff pasted every Word or PDF chapter into a formatter by hand and reviewed every book against a long checklist.

**Principle: the machine prepares, the author confirms, staff handle exceptions.**

## Flow

| # | Who | Step | Result |
|---|---|---|---|
| 1 | Author (Studio) | Upload a manuscript and cover, and fill in the details | Word (.docx) is preferred and EPUB is accepted. PDF is allowed with a warning that it is slower and more likely to be sent back. |
| 2 | System | Processing job, 1–3 minutes | Clean EPUB3 + book manifest + readiness score |
| 3 | Author (Studio) | Confirm chapters, preview 3 pages on a phone, fix plain-language flags, submit | Submission locked as revision *n* |
| 4 | System | Route by readiness | ≥ 90% with no blocking flags → **Ready for review**. Otherwise → **Needs fixes** |
| 5 | Staff (Publisher) | **Needs fixes**: open only the flagged spots | The score is recalculated, then the book moves to Ready for review |
| 6 | Staff (Publisher) | **Quick review**, about 5 min | Approve (publish now or schedule) or **Send back** with an issue list filled in from the flags |
| 7 | System | Publish | Revision goes live, the author's followers are notified, and Discover gets New arrivals |

Updates to a live book go through the same flow. Readers keep the approved revision until the new one is approved.

### Fast lane for updates
An update publishes after the automated checks, with no person involved, when **all** of these hold:
- under 2% of words changed
- no chapters added or removed
- the cover and metadata are unchanged
- the author has no upheld report or claim in the last 90 days

The diff is logged. Publishers spot-audit a sample each week from Book → Revisions.

## Stages

| Stage | Owner | Notes |
|---|---|---|
| Draft | Author | Not yet submitted |
| Processing | System | Shown in the admin as one line; nobody has to act |
| Needs fixes | Staff | Promise: within 2 days |
| Ready for review | Staff | Promise: within 3 days of submission |
| Sent back | Author | Issue list in Studio, plus push and email |
| Scheduled | System | Launch date set; can show under Coming soon |
| Live | — | Current approved revision |
| Unpublished / Taken down / Rejected | Staff | Taken down = copyright claim upheld; royalties for the book frozen |

## Processing job

1. **Ingest.**
   - The upload goes to Cloudflare R2 through a signed URL.
   - A `book_revisions` row is created with status `processing`.
   - A `book_ingest` message goes onto Supabase Queues (pgmq).
2. **Convert.**
   - DOCX: pandoc → HTML.
   - EPUB: unpack, sanitise, rebuild.
   - PDF: text and layout extraction plus heuristics (lower confidence, so more flags).
3. **House style.**
   - Straight quotes become smart quotes, and dashes are fixed.
   - Scene breaks are normalised.
   - Fonts, colours and inline styles are stripped; empty paragraphs are removed.
   - Images are compressed and limited to 1,600 px.
4. **Structure.**
   - Chapters are detected from heading styles and from "Chapter N" or "N." patterns.
   - Front matter is detected.
   - The table of contents is built.
5. **Numbers.**
   - Word count sets the standard page count, which sets the price: Price = ceil(standard pages ÷ 2) credits, where a standard page is 250 words and a full-page image counts as 1 page (1 credit = ₦3).
   - The 10% preview cut is placed at the nearest paragraph end.
6. **Anchors.** Each paragraph gets an id plus a content fingerprint. On updates, anchors are matched by fingerprint so highlights and paragraph discussions survive; anything unmatched moves to the nearest paragraph and is reported.
7. **Checks.**
   - epubcheck.
   - Cover: size and aspect, and readable as a thumbnail.
   - Plagiarism similarity against known sources.
   - Content-policy classifier.
   - Copyright page present.
   - Chapter count matches the TOC.
8. **Output.** The job writes these to R2:
   - EPUB3 (what foliate-js reads in the app)
   - `manifest.json`: chapters, paragraph ids, word counts, preview cut
   - preview EPUB
   - cover sizes

   The revision row gets the score and the list of flags.

**Where it runs (updated 16 Nov 2026).** No cloud container. DOCX and EPUB are converted on the author's phone; a Cloudflare Worker verifies, prices and encrypts every upload; PDFs and problem files go to a staff desk CLI (pandoc, epubcheck) on our computers. See [prd/ARCHITECTURE.md](prd/ARCHITECTURE.md) and [prd/12-book-pipeline.md](prd/12-book-pipeline.md).

## Readiness score
- The score starts at 100. Each failed check subtracts its weight, and some checks are blocking (they force Needs fixes whatever the score).
- Blocking checks: epubcheck error, plagiarism over 30%, content-policy hit, chapter detection failed.
- Weights live in config so Publishers can tune them without a deploy.
- Every flag stores a plain-language message, a suggested fix and a location, so the same text drives the author's Studio, the staff Fix screen and the Send back issue list.

## Notifications
| Event | Who gets it | How |
|---|---|---|
| Processing done | Author | Push and in-app |
| Sent back | Author | Push and email, with the issue list |
| Approved | Author | Push and email |
| Book live | Author's followers | Push |
| Late item | Staff, by role | Staff alerts |

## Screens
- **App (Author Studio):** `studio-submit` → `studio-processing` → `studio-chapters` → `studio-preview` → `studio-submitted`. Prototype: `prototype/src/05-money-profile-studio.html`.
- **Admin:** `books` (Needs you / Processing / Sent back / Live), `book-processing`, `book-formatter` (Fix flagged issues), `book-preview` (Quick review), `book-changes` (Send back), `book-approve`, `book-revisions` (fast lane). Prototype: `admin/src/10-access-overview.html`, `admin/src/20-catalogue.html`.

## Open questions
- Plagiarism provider and its cost per check.
- Do we keep accepting PDF at launch, or ask for Word only and add PDF later?
- Fast-lane threshold: is 2% right, or should it be a fixed number of words?
