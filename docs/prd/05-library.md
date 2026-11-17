# Flow 05 · Library

**Build order:** 7 · **Depends on:** flows 03 (entitlements, unlock), 04 (progress, offline downloads), 09 (plans, for the offline refresh rule) · **Prototype:** app screens `s-library`, `s-library-list`, `s-pay-rest-lib`, `s-library-saved`, `s-library-finished`, `s-library-offline`, `s-library-filter`

## Goal
One place for every book a reader has started, saved, finished or downloaded. The reader can continue where they stopped, see how each book is paid for, finish paying with one tap, and manage what is stored on the phone. Continue reading lives here, not on Home.

**Success looks like:** 70% of returning readers open a book from Library within two taps of launching the app; Library shows its content in under 1 s from cache on a mid-range phone, offline included.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Library: reading (grid) | `s-library` | Orange band, search, grid/list toggle, shelf chips with counts, Reading shelf |
| Library: reading (list) | `s-library-list` | Rows with chapter, time left, offline state, how it is paid for |
| Pay the rest | `s-pay-rest-lib` | Finish paying for a pay-as-you-read book |
| Library: saved | `s-library-saved` | Saved shelf, with credit cost or coming-soon date |
| Library: finished | `s-library-finished` | Finished shelf with your rating |
| Library: offline | `s-library-offline` | Downloads, space used, the 7-day note, empty state |
| Filter library | `s-library-filter` | Shelf radio list with counts and sort order |

## Behaviour

### Shelves and counts
1. Four shelves shown as chips with counts under the search bar: **Reading**, **Saved**, **Finished**, **Offline**. Reading is the default. The selected chip stays selected when the reader leaves and returns in the same session; on a cold start it is Reading.
2. **Reading** = books with a `reading_progress` row, no `finished_at`, and `max_percent > 0`. This includes books whose free preview ended and are not unlocked. A book moves to Finished when `finished_at` is set (95% reached, flow 04). Sorted by last opened, newest first.
3. **Saved** = rows in `saved_books` (reader tapped Save on the book page or the cover menu) **plus** books the reader owns or was gifted and has never opened (they leave Saved when first opened, and enter Reading). Coming-soon books the reader saved or tapped "Notify me" on also appear here with their date.
4. **Finished** = books with `finished_at`. Sorted by finish date, newest first. The section header reads "{n} books this year" (current calendar year); the chip shows the all-time count.
5. **Offline** = books with at least one downloaded chapter file on this device. This shelf is device-specific; the other three follow the account.
6. A book can be on several shelves only by these rules (Saved and Reading are mutually exclusive for a never-opened owned book; a finished book can also be Saved and Offline). Counts on chips equal the number of books the shelf would list.
7. Chip counts update immediately after a local change (open a book, finish, download, remove) without waiting for the server.

### Header, toggle, search, filter
8. Title "Library", grid/list toggle (44px targets). The choice is stored on the device and in `profiles.library_view` and applies to all shelves except Offline, which is always a grid.
9. **Search your library** (same as v25): the field filters the reader's own books by title and author across all shelves, on the device, as they type (debounced 150 ms), and works offline. Results show the shelf each match is on. Clearing returns to the current shelf. (The prototype links the field to the global search; see Open questions.)
10. **Filter** button opens `s-library-filter`: a single-select list of shelves with counts, and **Sort by**: Last opened (default), Title (A to Z), Progress (highest first). The primary button reads "Show {n} books" with the live count. Sort applies to Reading and Saved; Finished sorts by finish date regardless unless Title or Progress is chosen; Offline sorts by download date.
11. The filter and the chips are the same state: choosing a shelf in the filter selects the chip.

### Grid (`s-library`)
12. Each cover shows reading progress as a percent badge and a thin progress bar on the cover (books with progress only), a ⋯ button, title, author, and a state line when relevant: "Preview ended" (free preview finished, not unlocked), "Unlocked", a credit cost, a date.
13. Tapping a cover: Reading books open the reader at the saved position (`s-reader`); a book with "Preview ended" opens the reader at the preview-end card (`s-preview-end`); Saved and Finished books open the book page (`s-book`), except "Rate this book" on Finished, which opens `s-write-review`.
14. **Cover menu (⋯)** (default content; no prototype screen): View book page, Download for offline or Remove download, Remove from Saved (only on Saved), Share. Nothing in this menu spends credits. Removing a download deletes files and keys for this device; the reader's unlocks are unaffected.

### List (`s-library-list`)
15. Each row: small cover, title, author in the brand ink colour, a status line, a progress bar, and a metadata line.
    - Status line by payment state:
      - Owns the whole book: "Chapter {n} of {total} · unlocked".
      - Pay as you read, partly paid: "Pay as you read · Paid {paid} of {price} credits".
      - Free preview finished: "Free preview finished".
    - Metadata line: "{percent}% · {time left}" where time left = remaining words ÷ 230 wpm ("2 h 10 min left", "1 h left"); an "Offline" pill when the book has downloaded files on this device and a valid license.
    - Trailing action: pay-as-you-read books show **Pay the rest · {left}**; preview-ended books show **Unlock · {price} credits**. Both are text buttons with a 44px target.
16. Chapter number in "Chapter 7 of 14" is the chapter of the saved position (`reading_progress.chapter_uid`), counted among all chapters in the manifest. Parts of a long chapter count as separate chapters in the number.
17. "Pay the rest · {left}" opens `s-pay-rest-lib`. "Unlock · {price}" opens the unlock sheet from flow 03 (`s-unlock`, or the low-balance and no-plan variants by the same rules).

### Pay the rest (`s-pay-rest-lib`)
18. Sheet: title Pay the rest, subtitle "{title} · {pages} pages". Rows: Book price, Already paid (−), Left to pay. Copy: the whole book downloads for offline reading, and you won't stop at chapter breaks again. Button "Pay {left} credits".
19. The button calls `unlock_book(book_id, expected_price, key)` (flow 03). `left` is computed by the server (`price − active chapter charges`); the sheet shows the server's number, never a number computed on the phone. The total paid never exceeds the book price. If the price changed while the sheet was open the sheet refreshes and asks for another tap.
20. Not enough credits routes to the low-balance sheet (`s-unlock-low`, flow 03) with the missing amount. No plan routes to `s-unlock-nosub`.
21. On success: the sheet closes with a toast "Paid {left} credits · {title} is yours to keep", the row loses its Pay the rest button, and the whole-book download starts (flow 04, `/download` scope `whole`). Unlock all or a gift never shows Pay the rest.

### Saved (`s-library-saved`)
22. Header "Saved" with "{n} books". Each cover's state line: not unlocked shows its price ("110 credits"), unlocked or gifted shows "Unlocked" (gifts: "Gift from {name}"), coming soon shows "Out {date}".
23. The ⋯ on a Saved book offers Remove from Saved. Removing a book that is Saved only because it is unopened-owned hides it from Saved without removing the entitlement (it will show in Reading once opened, or can be found through search).

### Finished (`s-library-finished`)
24. State line: "★ {n} · you rated" when the reader has a review row, else "Rate this book". Header "{n} books this year".
25. A finished book's room annotations (the book discussion) are open: opening the book page shows the discussion row unlocked (flow 03, flow 06).

### Offline (`s-library-offline`)
26. Header "Offline downloads" with "{n} books · {size}". Size is the sum of the encrypted files on this device, in MB with 0 or 1 decimal.
27. Each cover shows its state line: "Ready offline · {days} days left" (license `valid_until` minus now, rounded down, "Less than a day left" under 24 h), "Expired · connect to refresh" (license past `valid_until`, files still on the device), "Downloading {percent}%" with a cancel option on long-press, or "Download paused" when interrupted.
28. Callout: "Downloads last 7 days and refresh when you're back online with an active plan." (info style, no icon).
29. **Refresh:** when the app has network and the reader has an active plan, licenses are refreshed in the background by calling the Worker `/keys` (flow 04). A refresh that fails leaves the license as is; the shelf reflects the real state.
30. **Empty state** (no downloads): a short explanation of the 7-day rule and two ways forward: "Download from Reading" (switches to the Reading shelf) and "Find a book" (opens Explore, `s-explore`). No illustration icon.
31. Tapping an expired book on the offline shelf with network refreshes it first (spinner on the cover) and then opens it; without network, a toast "Connect to refresh this book".

### Continue reading
32. The most recently opened Reading book is the first cover on the Reading shelf. Home no longer has a Continue reading rail (flow 02 removes it). A reader with no Reading books and an unfinished preview sees an empty state (below).

### Data flow
33. Library data is read from one RPC and mirrored locally. On launch and on screen focus the app shows the local mirror immediately, then fetches changes. The mirror (SQLite via expo-sqlite) holds the reader's shelves, covers (image cache), progress, entitlement summaries and prices as of the last sync, with a "last synced" time.
34. A progress change made in the reader updates the mirror at once (flow 04), so the order and the percent on cover are right when the reader goes back.
35. Pagination: 24 books per page, infinite scroll, with a footer skeleton while loading the next page.

## States and edge cases
- **Empty:**
  - Reading (new reader): "Nothing in progress. Pick something from Discover." with a Browse books button (opens `s-home`).
  - Saved: "Save books to find them here." with the same button.
  - Finished: "Books you finish will be here." (no button).
  - Search with no matches: "No book called that in your library" with "Search all books" (opens global search with the typed text).
  - Offline: rule 30.
- **Loading:** cover grid skeleton (six tiles) or six row skeletons; chips show counts as skeleton until known; from cache the first paint is instant.
- **Error:** fetch failure keeps the cached content and shows a thin "Couldn't refresh. Pull to retry." banner; no cache at all shows a full retry state.
- **Offline:** Reading, Saved, Finished, search and toggle work from the mirror; "Pay the rest", "Unlock", Save changes and Notify are disabled ("Connect to continue") except that Save and Remove from Saved queue locally and sync later. Covers not yet cached show the generated cover (title and author on a colour).
- **Edge cases:**
  - Book unpublished by staff: owners still see it (with "No longer on Arpedia" state line) and can read it if access was kept; it cannot be saved or gifted.
  - Book updated to a new revision: progress stays; percent re-computes on next open; the cover shows the new cover.
  - Finished then "Read again": reading again moves it to Reading only if the reader moves position below 95% by a full chapter; otherwise it stays Finished. (Default; see Open questions.)
  - Gift of a book the reader had partly paid for is blocked (flow 03), so Pay the rest never conflicts with a gift.
  - Offline shelf shows only this device; a book downloaded on another phone is not listed.
  - A very long title wraps to two lines on covers and rows; author truncates with ellipsis.
  - Large text (200%): the list row stacks metadata under the progress bar; chips scroll horizontally; touch targets stay at 44px.

## Data
**`saved_books`**: `user_id`, `book_id`, `created_at`; primary key (user_id, book_id). **`profiles.library_view text default 'grid'`**. Everything else is derived from tables owned by other flows:
- Reading and Finished from `reading_progress` (flow 04).
- Paid state from `entitlements` and `credit_ledger` (flow 03).
- Offline state is **local only** (files on the device) joined with `offline_licenses` for `valid_until`.
- Rating from `reviews` (flow 03).

**View `library_items`** (security invoker): one row per (user, book) for books with progress, a save, or an entitlement: `book_id`, `title`, `author_name`, `cover_url`, `shelf_flags` (reading, saved, finished), `percent`, `max_percent`, `chapter_uid`, `chapter_ord`, `chapters_total`, `last_opened_at`, `finished_at`, `owns_book`, `paid_credits`, `price_credits`, `remaining_credits`, `coming_soon_at`, `gift_from_name`, `my_stars`, `words_left`, `unpublished bool`.
**Local SQLite** (`library_cache`): the same columns plus `synced_at`, and a `pending_ops` table for queued Save and Remove from Saved.
**RLS:** `saved_books` owner only. `library_items` is a view over tables that are already owner-only, so it returns only the caller's rows. Staff cannot read it from the admin console.
**Migration from v25:** import v25 Saved shelf into `saved_books`; Reading and Finished are rebuilt from migrated `reading_progress` rows (flow 04); v25 offline downloads are not migrated. The `profiles.library_view` default is `grid`.

## Server
- **`get_library(shelf ('reading'|'saved'|'finished'), sort, after_cursor, limit) → {items, counts: {reading, saved, finished}, next}`** (reader, RPC reading `library_items`; counts are computed once per call). Cursor pagination by (sort key, book_id).
- **`save_book(book_id)` / `unsave_book(book_id)`**: idempotent upserts and deletes on `saved_books`.
- **`set_library_view(view)`**: updates the profile column.
- **Pay the rest** is `unlock_book` (flow 03). **Downloads and licenses** are the Worker `/download` and `/keys` endpoints (flow 04). No new server logic touches credits here.
- Cover images are served from R2 through the Worker's image endpoint with long cache headers; the app caches them on disk.
- No Supabase Edge Functions or Realtime. Counts refresh on screen focus and pull to refresh.

## Admin side
None. Staff do not browse readers' libraries. Support sees a reader's unlocks and credits in Reader accounts (flow 10) and the chapter-charge return in Credits (flow 14). Staff alerts or analytics about library use come from flow 15 analytics.

## Analytics
`library_opened {shelf, count}` · `shelf_changed {from, to}` · `library_view_toggled {view}` · `library_search {query_length, results}` · `library_filter_applied {shelf, sort}` · `library_book_opened {shelf, owned, percent}` · `pay_rest_viewed {left}` · `pay_rest_confirmed {left}` · `download_removed {book_id, bytes}` · `offline_shelf_refresh {result}` · `library_empty_cta {shelf, cta}`.

## Done when
- [ ] On a real Android phone: Reading, Saved, Finished and Offline show seeded books with correct counts; counts update at once after opening a book, finishing one and removing a download.
- [ ] Library paints from cache in under 1 s with airplane mode on; search works offline.
- [ ] List view shows chapter, time left, offline pill and payment state for an unlocked book, a pay-as-you-read book and a preview-ended book.
- [ ] Pay the rest charges only what is left (seeded: price 184, paid 132, charge 52), the total equals the book price, a double tap charges once, and the whole-book download starts.
- [ ] Offline shelf shows days left, space used and the 7-day note; expired books refresh online with an active plan and are refused without one; the empty state shows both actions.
- [ ] A book unlocked or gifted on another device appears in Saved until first opened.
- [ ] Grid and list toggle, filter and sort persist; large text and all four themes checked.
- [ ] **pgTAP:** `get_library` returns only the caller's rows and correct shelf membership and counts (reading vs finished boundary at 95%; unopened-owned in Saved); `save_book` idempotent; RLS on `saved_books`; `library_items` leaks no other user's rows.
- [ ] **Vitest:** shelf classification, time-left maths, days-left rounding, sort comparators, cursor pagination.
- [ ] **Maestro:** one happy path: open Library from a cold start, continue a book from Reading, pay the rest on a pay-as-you-read book, see it on the Offline shelf.
- [ ] No webhook replay tests apply here.

## Not in this flow
Custom shelves or collections, deleting a book from the account, archive, a year filter on Finished, reading statistics and goals, sharing a shelf. Credits history and plans (flow 09). Unlock rules (flow 03). The reader (flow 04).

## Open questions
- The library search field in the prototype links to global Search. Default here is an on-device filter of the reader's own books (v25 "Search your library"). Which one?
- The cover ⋯ menu has no prototype screen; the contents in rule 14 are a default.
- Re-reading a finished book: stays Finished (default) or moves back to Reading?
- Should a never-opened owned book appear in Saved (default) or in a "New" state in Reading?
- "Books this year" counter: current calendar year (default) or rolling 12 months.
- Download refresh for readers whose plan lapsed: prototype says it needs an active plan; confirm that lapsed readers lose offline after 7 days while keeping online access.
