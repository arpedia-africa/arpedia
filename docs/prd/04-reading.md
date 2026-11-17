# Flow 04 · Reading

**Build order:** 5 · **Depends on:** flows 01, 02, 03 (entitlements, price, `spend_credits`), 12 (encrypted per-chapter book artefacts and manifest) · **Prototype:** app screens `s-reader`, `s-reader-chrome`, `s-reader-select`, `s-chapters`, `s-notes`, `s-reader-settings`, `s-reader-dark`, `s-discuss`, `s-note-dialog`, `s-share-club`, `s-reader-menu`, `s-preview-end`, `s-reader-chapter`, `s-reader-unlocked`, `s-reader-chapter-low`, `s-pay-rest`, `s-book-end` · admin: content reports (screens live in flow 14)

## Goal
A reader opens any book, reads the free 10%, and keeps reading with chapters unlocking as they go, without ever being charged by surprise, losing their place, or fighting the text selection. This is the highest-risk flow: v25 had a highlight toolbar that covered the selected text, dead-end discussion popups, and parsing bugs. Every behaviour below is written to be testable so those bugs cannot return.

**Success looks like:** 95% of reading sessions open to the right position in under 1.5 s on a 2 GB RAM phone; zero reports of a chapter charged twice or charged without the reader turning past its first page; highlight create success rate above 99%.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Reader | `s-reader` | The page: chapter heading, text, your highlights, dotted passages with counts, footer progress |
| Reader controls | `s-reader-chrome` | Tap the middle: progress slider, % read, page, chapter x of y, Chapters, Night, Notes, Settings, Room |
| Highlight toolbar | `s-reader-select` | Colours, Note, Discuss, Club, Share on a selection |
| Chapters | `s-chapters` | Chapter list with progress, where your club is; Bookmarks tab |
| Notes and highlights | `s-notes` | Highlights, Notes, Bookmarks tabs |
| Reading settings | `s-reader-settings` | Highlight colour (six), background Light/Sepia/Dark, font size, font, line spacing, layout, Auto-unlock |
| Reader, night | `s-reader-dark` | Warm dark theme, dimmed highlights |
| Passage discussion | `s-discuss` | Thread pinned to a paragraph |
| Add a note | `s-note-dialog` | Note on a selection, private by default, share to club switch |
| Share to a club | `s-share-club` | Post the highlight as a quote card in a club |
| Reader menu | `s-reader-menu` | About, Search in book, Book room, Share, Report a problem |
| End of free preview | `s-preview-end` | Unlock card at the preview cut |
| Pay as you read: next chapter | `s-reader-chapter` | Chapter card at the start of a locked chapter |
| Pay as you read: chapter unlocked | `s-reader-unlocked` | Toast with Undo |
| Pay as you read: not enough credits | `s-reader-chapter-low` | Pause at the chapter start, top-up options |
| Pay the rest | `s-pay-rest` | Pay the remaining price, download the whole book |
| Finished the book | `s-book-end` | Rate, open discussion, tip, read next |

## Behaviour

### A. Architecture (the contract between app, reader bundle, and book files)
1. **Reader bundle.** `packages/reader` builds foliate-js (MIT) plus a bridge script into a single local HTML/JS bundle shipped inside the app and loaded in a `react-native-webview` from the app's own files. The WebView has no network access: `originWhitelist` is the local bundle only, JavaScript from book content is disabled (book HTML is sanitised by flow 12 and rendered in foliate's sandboxed iframes without `allow-scripts`), cache and file access are off. No tokens, keys or Supabase calls ever exist inside the WebView. Never fork Readest.
2. **Book files.** Flow 12 produces, per revision: a manifest, and per chapter an encrypted `full` file and, where the chapter has free content, an encrypted `free` file. Files are AES-256-GCM. `free` files and chapters wholly inside the preview use the revision's shared **preview key** (`K_free`). Every other `full` file uses its own **chapter key**. Package files (container, OPF, nav, styles) use `K_free`. The `free` file of a chapter is an exact structural prefix of its `full` file: same element order, same element ids, same paragraph ids, so a CFI valid in one is valid in the other.
3. **What is free per chapter** (from the manifest): chapters that end before the preview cut: all of it. The chapter containing the cut: text up to the cut paragraph. Every later chapter: its heading plus the opening paragraphs up to the first paragraph end after 300 words, capped at 40% of the chapter and never the whole chapter (the "peek"), enough to fill the first page at any font size. Locked chapters have no readable text beyond the peek in any file the reader's keys can open.
4. **Keys.** The app only ever holds keys the reader is entitled to: `K_free` always, chapter keys for chapters they own (all keys for Unlock all or gifts). Keys are delivered by the Cloudflare Worker `/keys` endpoint (see Server), wrapped to the device's public key, and stored on the device encrypted under a master key held in the Android Keystore (via expo-secure-store). Plaintext chapter text only ever exists in memory: native decrypts and hands the XHTML to the WebView.
5. **Loader.** The bundle opens the book with foliate-js's EPUB reader over a custom loader. Each time foliate asks for a file, the WebView sends `resource.request` and native replies with the decrypted bytes. Which file is returned for a spine item depends on the **access map** (rule 7).
6. **Manifest** (from flow 12, passed to the WebView in `open`): book id, revision id, total words, preview cut (`chapter_uid`, `para_id`), and per chapter `{chapter_uid, ord, title, kind (chapter|part), words, words_before, pages, price_credits, free_file, full_file, paragraphs: [{id, words_before}]}`. All percent and page maths use this manifest, never foliate's byte-based fraction.
7. **Access map**: per chapter one of `open` (whole chapter free), `partial` (free up to the cut), `unlocked` (reader holds the key), `locked` (peek only). It is computed natively from `get_reader_state` plus the local key store and sent to the WebView; it is recomputed after every unlock, undo, key refresh and download. Rule: a chapter is `unlocked` only if its key is in the local store **and** the license (rule 71) is valid.
8. **Changing access** (unlock or undo) re-renders the current section in place: the WebView drops that section's cached document, then calls `goTo` on the current start CFI. If foliate cannot reload in place, the bundle closes and reopens the book at the same CFI (target under 500 ms). The reader's position must be identical before and after.

### B. Opening the reader
9. Entry points: book page buttons, Library, Continue reading, deep link `arpedia://read/{book_id}?cfi=…` (from a quote card or a highlight). The reader opens full screen below the status bar; the back button returns to the previous screen. (Fixed from v25: the header no longer sits under the status bar.)
10. Native calls `get_reader_state(book_id)`: revision id, manifest URL, entitlement summary, balance, saved position, annotations cursor, `reader_settings`. If offline and the book is downloaded, the same data is read from the local copy. It then sends `open`.
11. Start position: the server position if newer than the local one, otherwise local; none means the first page. If the saved CFI cannot be resolved (revision changed), re-anchor by paragraph id (rule 31); if that fails, open at the start of the saved chapter and show a toast "Your place moved a little after an update".
12. The first page appears as soon as the first section is rendered; annotations, discussion markers and counts load afterwards and never block the first page.
13. If the reader opens a book they have no entitlement to beyond the preview (from the book page "Start reading"), the free files and `K_free` are enough; no payment screen appears until the preview cut.

### C. Positions, percent and pages
14. **A position is an EPUB CFI** (`epubcfi(...)`) of the first visible character of the current page or scroll position, as foliate reports it in `relocate`. Alongside every CFI the app stores `chapter_uid`, `para_id` (nearest paragraph at or before the start) and `char_offset` within it. The CFI is the fast path; `para_id + char_offset` is the durable anchor that survives revisions.
15. **Percent** = (words before the start paragraph + words inside it before the offset) ÷ total words, from the manifest, 0–100 with one decimal. Computed in `packages/core` (`positionToPercent`, `percentToParagraph`) and unit tested. Footer shows whole percent.
16. **Page number** is the standard page (250 words, images 1 page) at the position, "page 84 of 250". It is device independent so it matches the book page. (The prototype's "of 221" is placeholder.)
17. **Time left in chapter** = remaining chapter words ÷ 230 wpm, shown as "11 min left in chapter", "Less than a minute" under 1.
18. The footer (percent, thin bar, time left) is always visible; the controls (rule 20) appear on demand.

### D. Bridge messages (app <-> WebView)
All messages are JSON `{v:1, id, type, payload}`. `id` is set on requests; replies echo it as `reply_to`. Unknown `type` or wrong `v` is ignored and logged to Sentry. The WebView only accepts messages from the native side; native only accepts messages whose `type` is listed here.

| Direction | type | Payload | Meaning |
|---|---|---|---|
| native → web | `open` | manifest, access map, `start {cfi?, para_id?, offset?}`, settings, annotations | Open or reopen the book |
| native → web | `resource.response` | `reply_to`, `bytes_b64` or `error` | Decrypted file for a `resource.request` |
| native → web | `goTo` | `{cfi}` or `{para_id, offset}` or `{percent}` or `{chapter_uid}` | Navigate |
| native → web | `next` / `prev` | `{unit: page|chapter}` | Page turn from the side tap or hardware key |
| native → web | `settings.apply` | font size, family, line spacing, layout, theme, highlight colour | Restyle; the bundle keeps the same start CFI |
| native → web | `access.update` | access map, `reload_section` | After unlock, undo or key refresh |
| native → web | `annotations.set` | list `{id, kind, color, cfi_range, para_id}` | Draw highlights and underlines (full list on open, deltas later) |
| native → web | `markers.set` | `[{para_id, count}]` | Discussion counts to draw |
| native → web | `selection.clear` | | Clear the current selection |
| native → web | `advance.decision` | `reply_to`, `allow: bool`, `reason` | Answer to `advance.request` |
| native → web | `search` | `{query}` | Search unlocked text only |
| web → native | `ready` | `{bundle_version}` | Bundle loaded, ask for `open` |
| web → native | `opened` | `{toc, sections}` | Book parsed |
| web → native | `resource.request` | `{path}` | Needs a file |
| web → native | `relocate` | `{cfi, para_id, offset, chapter_uid, start_para, end_para, percent, page, words_left_in_chapter, at_first_page_of_chapter, at_gate: null|{kind: chapter|preview, chapter_uid}}` | Page changed |
| web → native | `advance.request` | `{from_chapter_uid, gate_kind}` | A forward move off the first page of a locked chapter or past the preview cut is being held (rule 51) |
| web → native | `tap` | `{zone: left|center|right, x, y}` | Tap on empty page area |
| web → native | `selection` | `{cfi_range, text, para_id_start, para_id_end, rects:[{x,y,w,h}], page_rect}` | Stable selection (rule 36) |
| web → native | `selection.cleared` | | Selection gone |
| web → native | `annotation.tap` | `{id, rect}` | Tap on an existing highlight or note mark |
| web → native | `marker.tap` | `{para_id}` | Tap on a dotted passage or its count |
| web → native | `search.result` | `{items: [{cfi, excerpt, chapter_uid}]}` | Search hits |
| web → native | `error` | `{code, detail}` | `parse_failed`, `resource_missing`, `decrypt_failed`, `render_failed` |

19. **Errors in the WebView** never leave a white screen. `parse_failed` or `render_failed` shows "This book couldn't be opened" with Try again and Report a problem; `resource_missing` or `decrypt_failed` triggers one automatic re-download of that chapter, then the same state. Every error carries book id, revision, chapter and bundle version to Sentry.

### E. Page, controls and navigation
20. Tapping the middle 40% of the page toggles the controls (`s-reader-chrome`): top bar with Back, bottom bar with progress slider, "{n}% read · page {p} of {P}", "Chapter x of y", and Chapters, Night, Notes, Settings, Room. Tapping the left or right 30% turns the page (Pages layout). In Scroll layout there are no side zones. Controls hide on the next page turn, after 5 s idle, or on tap.
21. The slider is draggable. While dragging, the label shows the target percent and chapter; the book moves on release only. A drag target beyond the furthest reachable point is clamped to the first page of the first locked chapter (or the preview cut) and the matching card shows. Releasing never charges.
22. Pages layout: swipe or tap to turn, 200 ms (`--m-base`) slide; reduced motion: instant fade. Scroll layout: continuous scroll per chapter; chapter changes show a short divider.
23. **Chapters** (`s-chapters`): tabs Chapters and Bookmarks (count). Each chapter row: number, title, state: "Read" (max progress passed its end), a ring with percent when current, a lock mark on locked chapters (not an icon tile; text "Locked · {price} credits" under the title), and "{Club} is here" on the chapter where the reader's club is currently reading. Tapping a locked chapter opens its first page (peek) with its card; it does not charge.
24. **Reader menu** (`s-reader-menu`): About this ebook (opens `s-book-about`), Search in book, Book room (opens `s-channel`, flow 06), Share this book (`s-share-club`), Report a problem with this book.
25. **Search in book**: runs in the WebView over text the reader can open (free and unlocked). Hits in locked chapters are not searched; if the query would match nothing but locked text exists the result list ends with "Unlock more chapters to search the rest". Results tap to `goTo` the CFI.
26. **Report a problem** writes a `reports` row (`kind='book_content'`, book, revision, chapter, CFI, optional note ≤500 chars) and shows a toast "Thanks. We'll check it." Staff see it in Content reports (flow 14).
27. **Status bar and safe areas** are respected on every screen; controls sit inside the safe area; touch targets are 44px.

### F. Selection and the highlight toolbar (v25 bug area, be literal)
28. Selection is handled inside foliate's iframe with the document's own selection. The phone's native copy/select action menu is turned off (`menuItems` emptied on Android WebView plus `-webkit-touch-callout: none` and `user-select` only on book text). This must be verified on the device list in Done when.
29. A long-press selects a word; drag handles extend it. The selection is limited to one section (chapter file). A selection that would cross a section is clipped at the section end. Maximum selection 1,000 characters; beyond that the end handle stops and a toast says "That's a long passage. Highlight a shorter piece."
30. The bundle listens to `selectionchange` but **does not report while the finger is down or the handles are being dragged**. It reports `selection` only after both: `pointerup`/`touchend` has fired, and the selection has been unchanged for 250 ms. Moving a handle again sends a fresh `selection` after the same wait. Collapsing or tapping elsewhere sends `selection.cleared`.
31. `selection.rects` are the client rects of the selected range, translated into WebView viewport coordinates (adding the iframe offset and the column scroll of the paginator), unioned into one bounding box per line. `page_rect` is the visible page area.
32. **Toolbar placement** (native view over the WebView, never inside it): compute the bounding box of all rects; place the toolbar centred above the box with an 8 px gap. If there is not room above (box top − toolbar height < header bottom + 8), place it below the box with an 8 px gap. If neither fits (the selection spans most of the page), dock the toolbar in a fixed bar at the bottom of the screen above the safe area. The toolbar must never intersect any selection rect; this is asserted in a unit test of the placement function (pure function in `packages/reader`).
33. The toolbar hides on page turn, scroll, orientation change or `selection.cleared`, and reappears (recomputed) when a new `selection` arrives. It does not animate position while the selection is being adjusted.
34. Toolbar content, in order: colour swatches first (three: the reader's default colour and two others; tapping one creates the highlight at once and clears the selection), then Note, Discuss, Club, Share. Toolbar buttons are 44px high and the whole bar fits 360 px wide at 200% system font scale by wrapping to two rows if needed.
35. **Highlight** creates an annotation (rule 41) and draws it with `annotations.set`. **Note** opens `s-note-dialog`. **Discuss** opens `s-discuss` on the start paragraph's thread with the selection quoted. **Club** and **Share** open `s-share-club`.
36. Tapping an existing highlight sends `annotation.tap`; native shows a small menu (change colour, add or edit note, discuss, delete) positioned by the same placement function. Overlapping highlights stack; a tap opens the most recent; others are reachable from `s-notes`. Delete is immediate with an Undo toast (5 s).
37. A reader can only select text that exists in the open files, so highlights can never exist in locked text.

### G. Highlights, notes, bookmarks
38. Kinds: `highlight` (colour), `note` (a highlight plus text), `bookmark` (a position). Six highlight colours: Green, Yellow (default), Blue, Pink, Purple, Peach. Colours are never the only signal: a note has a note mark, a shared one a "shared" label.
39. **Note dialog** (`s-note-dialog`): shows the quote, a text field (≤2,000 chars), and a switch "Share with {club name}" (off by default; the club is the book's club, named in the label). Save note creates or updates the annotation. If sharing is on the note posts to the club as a quote card (rule 56). If the reader is in no club for this book the switch is hidden.
40. **Bookmarks:** a Bookmark this page action sits at the top of the Bookmarks tab in `s-chapters` and in the controls. A bookmark stores CFI, chapter, and the first 80 characters of the page. Max 200 per book. (Default; see Open questions.)
41. **Storage:** each annotation stores `cfi_range` and the durable anchor (`start_para_id`, `start_char`, `end_para_id`, `end_char`, `quote` ≤500 chars), the `revision_id` it was made on, and a client-generated `client_id` (uuid) so offline creates are idempotent.
42. **Notes screen** (`s-notes`): tabs Highlights (count), Notes (count), Bookmarks (count). Each row shows "Chapter 7 · The Third Letter" (real chapter title; if unknown the label is omitted, never "Chapter 3" guessed), the excerpt in its colour, the note text, and "Private" or the club name. Tap goes to the position. Rows in a chapter that is currently locked open that chapter's first page and its card.
43. **Sync:** annotations are written offline to a local queue and sent with `upsert_annotations(batch)`; pulled with `pull_annotations(since_cursor)`, which returns changes and tombstones (soft deletes). Conflicts: last write by `updated_at` wins per annotation. A user's annotations are private unless a note is shared.
44. **Revisions:** when the reader opens a new revision, annotations are re-anchored lazily: resolve by `para_id + char offsets`; if the paragraph still exists but the text moved, search the `quote` inside it; if still not found, anchor to the paragraph start and mark the annotation "moved". Flow 12 keeps paragraph ids stable across revisions where text matches, so most need no work.
45. If a chapter is re-locked (undo) its annotations stay in the database and in the lists but are not drawn until it is unlocked again.

### H. Passage discussion
46. Passages other readers discuss show a dotted underline on the first sentence of the paragraph and an orange count in the margin (`markers.set`). Markers load in the background per chapter via `get_passage_counts` and show only for paragraphs at or before the reader's furthest position (`max_percent`), so counts never reveal where the story goes.
47. Tapping a marker or the count, or choosing Discuss, opens `s-discuss`: header "{n} comments", "On this passage in chapter {x}", the quoted passage, the thread, a composer. An empty passage shows "Be the first to say something about this passage". (Fixed from v25: no dead-end popup.)
48. A thread belongs to the **paragraph** (`book_id`, `para_id`), not to the selection, so it survives book updates. Comments are ≤1,000 chars, support two reactions (heart, praying hands), and author replies carry an Author badge.
49. **Spoilers:** a paragraph's thread is only available to a reader whose furthest position is at or past that paragraph. Within a visible thread, every comment is shown. (The prototype's "Spoiler hidden until you reach ch. 11" comes from the commenter marking it: a comment can carry an optional `reveal_at_chapter` the writer sets with a "Hide until chapter…" option; hidden comments show that line instead of the text. See Open questions.)
50. The thread refreshes when opened and every 20 s while open (no realtime). Posting uses `post_passage_comment`; the comment appears at once and is marked failed with Retry if the call fails. Reporting and blocking follow flow 14.

### I. Pay as you read in the reader (charging, idempotency, undo)
51. **Gates.** A gate is a position the reader cannot move past without paying: (a) the **preview cut** inside the chapter that contains it, (b) the **first page** of any locked chapter. The WebView knows the gates from the access map and the manifest.
52. **Preview end** (`s-preview-end`): when the page showing the last free paragraph is displayed and the next page would pass the cut, the unlock card appears **inside the page flow** below that text (never as a popup): "You've read the free 10%", whole-book price and balance, **Unlock all · {price} credits**, **Pay as you read · about {N} a chapter**, and "Not now, back to the book". Both buttons call the flows in 03 (sheet or direct, same rules). Moving forward is held until the reader pays.
53. **Locked chapter, Auto-unlock OFF.** When the first page of a locked chapter is displayed, the **chapter card** (`s-reader-chapter`) shows in the page flow: "Next up · Chapter {n} · {title}", "This chapter {price} credits", "Paid so far {paid} of {total}", "Your balance {balance} credits", **Unlock chapter · {price} credits**, **Pay the rest · {left} credits**, and the Auto-unlock switch. Peeking at the title and the first page is free. Forward moves off the first page are held until Unlock chapter or Pay the rest.
54. **Locked chapter, Auto-unlock ON.** No card. The reader reads the first page. The first forward move that would leave that page (page turn committed, scroll beyond one viewport, slider or chapter jump forward within the chapter) sends `advance.request`. A stray touch that does not complete a page turn sends nothing. Native then performs the charge (rule 56). If the reader only looks at the heading and turns **back**, nothing is charged.
55. **Held moves.** On `advance.request` the WebView does not move. Native answers `advance.decision {allow:true}` after a successful charge and the key is available, or `allow:false` with a reason: `insufficient_credits` (show the low-balance sheet), `offline` (toast "Connect to unlock this chapter"), `slow` (no answer within 5 s: toast "Still working. Check your connection." and the move stays held, charge is not retried with a new key), `auto_off`. On `allow:true` the WebView re-renders the section with the full file (rule 8) and completes the move.
56. **Charging, exactly.** Native generates an idempotency key `uuid` when the chapter's `advance.request` (or the Unlock chapter tap) first fires for this (user, chapter) in this app session and stores it in the local pending table until the call is confirmed. It calls `unlock_chapter(book_id, chapter_uid, source, key)`. Retries of the same intent reuse the same key. If the RPC returns `ok` or `already_unlocked`, native calls `/keys` for that chapter, stores the key, updates the access map and answers the held move. Two calls for the same chapter (double tap, two devices, retries) charge once: the key makes a replay return the first result, and an existing active chapter entitlement returns `already_unlocked` with no charge.
57. **Server charge amount.** `charge = min(chapter.price_credits, cap − credits already paid for this book)` where `cap = least(snapshot_price, effective_price)` and `snapshot_price` is stored in `paygo_accounts` at the reader's first chapter charge (flow 03). A chapter with price 0 is granted with no ledger row. When the sum of active chapter charges equals the effective price, the server also creates the book entitlement (`chapter_complete`), so the whole book becomes downloadable. The total paid can never exceed the upfront price. Re-reading a paid chapter is always free; no call is made for chapters whose key is stored.
58. **Unlocked toast** (`s-reader-unlocked`): "Chapter {n} unlocked · {price} credits" with **Undo**, visible 8 s at the bottom above the footer, not covering text being read (it floats over the footer area). Auto-unlock and manual unlock both show it.
59. **Undo.** Tapping Undo calls `undo_chapter_unlock(ledger_id, key)`. Allowed when all hold: the charge is under 10 minutes old (server clock), the caller owns it, it has not been undone, no `unlock_all` or `chapter_complete` entitlement has been created for the book since (otherwise Pay the rest already covered it), and the reader has not read more than 20% of the chapter by words (anti-abuse default). The undo row returns the credits, revokes the entitlement, subtracts the author earning, and native deletes the stored key and moves the reader to the previous chapter's end if they were inside it (the locked chapter's first page shows its card). Outside the window the same action is in Credits history for 10 minutes and later via Support (flow 14). Undone charges are not paid to authors.
60. **Not enough credits** (`s-reader-chapter-low`): the reader stops at the chapter's first page, never mid-page. Sheet: "Not enough credits for Chapter {n}", "You have {b} credits · this chapter is {p}", plan renewal date, the three packs (smallest that covers the chapter preselected), "Top up {n} credits · ₦{price}" (opens `s-pack-sheet`), and "Read something already unlocked" (Library). The place is saved. After a successful top-up the reader returns to the first page of that chapter and the move is retried **only if Auto-unlock is on**; otherwise the card shows.
61. **Pay the rest** (`s-pay-rest`, also from `s-library-list`): book price, already paid (−), left to pay; "Pay {left} credits". Calls `unlock_book` (flow 03). On success: toast, all chapter keys fetched, whole-book download starts, no more chapter stops.
62. The reader never shows a number it did not just read from the server for money: prices and balance on cards come from `get_reader_state`, refreshed after every spend.

### J. Settings
63. Settings (`s-reader-settings`), all applied live and kept per device, also saved to `profiles.reader_settings` and synced:
    - **Highlight colour**: six swatches; default Yellow; first swatch in the toolbar.
    - **Background**: Light (#FFFFFF page, #1D1A16 text), Sepia (#F6EBD9, #3B2F22), Dark (#14110D, #E8E0D4). Dark opens `s-reader-dark`: warm dark, never pure black, highlights dimmed (reduced saturation and 70% opacity so they do not glare). Night in the controls toggles Dark and the last light theme.
    - **Font size** 14–28, step 1, default 17, shown as a number. At the limits the button is disabled.
    - **Font**: Literata (default), Inter, Georgia-equivalent serif, Atkinson Hyperlegible. Fonts are bundled with the app.
    - **Line spacing**: Tight 1.35, Normal 1.6 (default), Loose 1.85.
    - **Layout**: Pages (default) or Scroll.
    - **Auto-unlock next chapter**: on by default; same value as in the pay-as-you-read sheet; the server rejects `source='auto'` calls when it is off.
64. The reader theme is independent of the app colour theme (Sunflower, Palm, Plum, Night) and never changes with it. Reader pages and highlight colours never use the main colour.
65. Applying any setting keeps the same start CFI: the bundle records it, restyles, then `goTo`s it.

### K. Progress and finishing
66. **Progress sync.** On `relocate`, native writes the position locally immediately, and sends `sync_reading_progress` at most once per 10 s (trailing, 2 s debounce), immediately on chapter change, and on app background or reader close. Offline, only the newest position per book is queued. The server ignores a write older than the stored `updated_at`; `max_percent` only increases; `finished_at` is set the first time percent reaches 95. The server rejects positions in a chapter the reader cannot open (beyond the gate).
67. **Two devices:** opening a book whose server position is more than 5% ahead of the local one from another device shows a toast "Continue from {n}%? (on {device name})" with Go and Stay; default Stay.
68. **Finish:** reaching 95% unlocks the book discussion (flow 06). Reaching the final page of the last chapter shows `s-book-end`: "You finished {title}", reading time across days (sum of `reading_sessions`), rate this ebook (stars), "The discussion is open" row, "Thank {author} with a tip" (opens `s-tip`), "Read next" with one book (from `book_related`). Close returns to Library.
69. **Sessions:** the app logs `reading_sessions` (start, end, active seconds; idle longer than 60 s pauses the clock). Used for the finish screen and stats, never for earnings.

### L. Offline and encryption
70. **Download** (from the book page, library, Pay the rest, Unlock all): native calls the Worker `POST /download {book_id, revision_id, scope: whole|owned}`. It returns short-lived (10 min) signed R2 URLs for the encrypted files in scope plus the key bundle. Scope `whole` (the reader owns the book) = all chapters; `owned` = package files, all `free` files, and the full files of owned chapters. Files are saved as received (already AES-GCM ciphertext) in app-private storage; the key bundle is stored per rule 4. Download resumes after interruption and shows progress in Library > Offline.
71. **License:** every key bundle carries `valid_until` (issue time + 7 days) signed by the Worker. The app trusts it using server time stamped at issue and a monotonic clock check (if the device clock moves back past the last seen time, treat the license as expired). Expired license: the book shows "Connect to refresh" and cannot open; free files of the preview still open with `K_free`. When the app is online with an active plan and the entitlement still holds, it refreshes licenses silently (no re-download unless the revision changed). Without an active plan the refresh is declined (rule in flow 09) and downloads lapse after 7 days; the book stays in the library and reads online.
72. Files for an expired license are deleted after 30 days. Sign-out and account deletion wipe all files and keys.
73. **Offline reading:** everything in the open files works: navigation, highlights, notes, bookmarks, settings, finishing. Not available: unlock (charge) and passage discussion; opening a locked chapter shows its card with "Connect to unlock". Position, annotations and sessions queue and sync later.
74. Book data is never written unencrypted: no plaintext cache, no WebView disk cache, no screenshots of the page in recents (Android window flag set on the reader screen) (default; see Open questions).

## States and edge cases
- **Empty:** no highlights, notes or bookmarks: each tab explains how ("Press and hold on a word to highlight it"). No chapters in the manifest (book with parts only): the Chapters list shows parts. No discussion on a passage: invitation (rule 47).
- **Loading:** first-page skeleton (heading and three lines); controls available; never a spinner over text. Download shows per-book progress.
- **Error:** see rule 19. Failed highlight save keeps the highlight drawn and queued with a small "Not saved yet" mark in `s-notes`. Failed `/keys` after a successful charge: state "Unlocking…" retries with backoff and reconciles on every reader open (entitled chapters without a local key are fetched).
- **Offline:** rule 73; Library works; downloads resume on reconnect.
- **First run:** the first time the reader opens, a one-line hint "Tap the middle for controls" (once).
- **Edge cases:**
  - Reader changes font size on a locked chapter's first page: the card stays; "first page" is defined by the chapter start, not by pixel count.
  - Paying the chapter on device A while device B shows its card: B gets the key on its next `get_reader_state` (on focus) and the card disappears; a later tap returns `already_unlocked`.
  - Revision published mid-session: the open revision stays until the reader leaves the book; the next open uses the new one.
  - Undo of a chapter after reading past it (inside window, under the 20% rule) is refused with "You've already read this chapter".
  - Price changed while mid-way (book update or override): remaining charge is capped by `least(snapshot, effective_price) − paid`; at zero remaining the next chapter is granted free.
  - A paragraph with only an image counts as a page and is selectable only as an image block; highlight is disabled on images.
  - Text selection near the top of the page flips the toolbar below (rule 32).
  - Hardware volume keys do not turn pages (default).
  - App killed during a charge: on restart the pending table retries with the same key; the ledger shows one row.

## Data
**`reading_progress`**: `user_id`, `book_id`, `revision_id`, `cfi text`, `chapter_uid uuid`, `para_id text`, `char_offset int`, `percent numeric(4,1)`, `max_percent numeric(4,1)`, `max_chapter_ord int`, `device_id`, `updated_at`, `finished_at null`, `first_opened_at`. Primary key (user_id, book_id). One row per book per user; the latest device wins.
**`reading_sessions`**: `id`, `user_id`, `book_id`, `device_id`, `started_at`, `ended_at`, `active_seconds`.
**`annotations`**: `id uuid`, `client_id uuid` (unique with user), `user_id`, `book_id`, `revision_id`, `kind ('highlight'|'note'|'bookmark')`, `color`, `cfi_range`, `chapter_uid`, `start_para_id`, `start_char`, `end_para_id`, `end_char`, `quote text ≤500`, `note_text ≤2000 null`, `visibility ('private'|'club')`, `shared_group_id null`, `moved bool`, `deleted_at null`, `created_at`, `updated_at` (index on user, book, updated_at).
**`passage_comments`**: `id`, `book_id`, `para_id`, `user_id`, `body ≤1000`, `quote text null`, `reveal_at_chapter_ord smallint null`, `status ('visible'|'removed')`, `created_at`. **`passage_comment_reactions`**: (comment_id, user_id, kind). Counts per (book, para) are a view; the markers query reads it.
**`devices`**: `id`, `user_id`, `name`, `public_key` (RSA-OAEP, SPKI), `created_at`, `last_seen_at`, `revoked_at null`. Max 3 active devices with downloaded books per account (default).
**`offline_licenses`**: `user_id`, `device_id`, `book_id`, `revision_id`, `issued_at`, `valid_until`, written only by the Worker (service role).
**`chapter_keys`** (service-role only, no client access): `revision_id`, `chapter_uid`, `wrapped_key` (wrapped by the Worker's master key), written by the ingest Worker (flow 12). `K_free` is stored the same way.
**`profiles.reader_settings jsonb`**: font_size, font, line_spacing, layout, theme, highlight_color, auto_unlock.
**Entitlements and ledger** are defined in flow 03; this flow adds RPCs on them.
**RLS:** `reading_progress`, `reading_sessions`, `annotations`: owner only, except a club-shared note, readable by members of that group through a view that exposes only quote and note. `passage_comments`: readable only if the reader's `max_percent` has reached that paragraph (policy joins the manifest paragraph table `paragraph_anchors`); insert only as self; moderators can set `status`. `devices`, `offline_licenses`: owner read, Worker write. `chapter_keys`: no policies (service role only).
**Migration from v25:** import highlights and notes by chapter and quote; re-anchor each to `para_id` using the latest revision by quote match, and set `moved=true` where only the paragraph matched. Import reading positions as percent and chapter only (v25 had no CFI): open at that paragraph. v25 offline downloads are not migrated.

## Server
**Postgres RPCs** (reader role, SECURITY DEFINER, all validate `auth.uid()`):
- `get_reader_state(book_id) → json`: revision, manifest URL, per-chapter prices and access states, entitlement summary, `paid_credits`, balance, saved position, `reader_settings`.
- `unlock_chapter(book_id, chapter_uid, source ('tap'|'auto'), key) → {status ('ok'|'already_unlocked'), ledger_id, spent, balance, undo_until, book_completed}`. Checks: chapter belongs to the live revision and is chargeable; caller does not own the book or the chapter; `source='auto'` only if `reader_settings.auto_unlock`; amount per rule 57; calls `spend_credits` with reason `chapter`; inserts the chapter entitlement (and the book entitlement on completion); one transaction; rate limit 30 per minute. Replay by key returns the first result.
- `undo_chapter_unlock(ledger_id, key)`: rules in 59; writes an `undo` ledger row (`ref_ledger_id` unique, so only one undo), revokes the entitlement, reverses `author_earning_kobo`.
- `sync_reading_progress(...)`, `upsert_annotations(batch)`, `pull_annotations(since)`, `get_passage_counts(book_id, chapter_uids)`, `get_passage_thread(book_id, para_id)`, `post_passage_comment(...)`, `react_passage_comment(...)`, `share_quote(group_id, annotation_id, message)` (creates a `messages` row of kind `quote` in flow 06), `report_book_problem(...)`, `log_reading_session(...)`, `entitled_chapters(book_id)` (used by the Worker with the caller's JWT).
- Pay the rest uses `unlock_book` from flow 03.

**Cloudflare Worker endpoints** (JS/TS, WebCrypto; caller sends the Supabase JWT, the Worker verifies it):
- `POST /devices {name, public_key}`: registers or updates the device; returns `device_id`. Enforces the device limit.
- `POST /keys {book_id, revision_id, device_id, chapter_uids?}`: calls `entitled_chapters` as the user; returns `K_free` and the entitled chapter keys, each wrapped with the device's public key (RSA-OAEP SHA-256), plus `valid_until` and a Worker signature over the bundle. Never returns a key for a chapter that is not entitled. Rate limited per user and device. Records the licence in `offline_licenses`.
- `POST /download {book_id, revision_id, device_id, scope}`: returns signed R2 URLs (10 min) for the files in scope plus the same key bundle.
- Both endpoints refuse revisions that are not the book's current live revision, except the revision the reader already holds a license for (so a reader finishes the revision they started until they reopen).
No Supabase Edge Functions and no Supabase Realtime are used in this flow.

## Admin side
- **Content reports** (flow 14 screens): reports of kind `book_content` arrive with book, revision, chapter and a "Open in preview at this position" link that opens the admin Quick-review reader at that CFI. A Publisher can fix by starting a revision (flow 12 fast lane for small edits).
- **Book stats** (flow 03) read `reading_progress.max_chapter_ord` for drop-off.
- Support's **Return a chapter charge** (`unlock-return`, flow 14) calls the same undo logic with a staff override of the 10-minute window; it is audited.
- No other admin screens are added here.

## Analytics
`reader_opened {book_id, source, owned, percent}` · `reader_ready_ms {ms}` · `reader_error {code}` · `page_turn_held {gate_kind}` · `preview_end_seen` · `chapter_card_seen {chapter_ord, price}` · `chapter_unlocked {chapter_ord, price, source: tap|auto}` · `chapter_unlock_failed {reason}` · `chapter_undo {seconds_since}` · `low_balance_in_reader {missing}` · `pay_rest {left}` · `highlight_created {color}` · `selection_toolbar_shown {placement: above|below|docked}` · `note_saved {shared}` · `discussion_opened {count}` · `passage_comment_posted` · `settings_changed {key}` · `book_finished {days, minutes}` · `download_started|completed|failed {scope, bytes}` · `license_expired_open_attempt`.

## Done when
- [ ] On a 2–3 GB RAM Android phone on throttled 3G: open a seeded book at the saved position under 1.5 s; read through the preview cut; the unlock card appears in the page; no text beyond the cut is visible or searchable.
- [ ] Pay as you read: Auto-unlock on charges exactly once per chapter on the first committed forward move off the first page; a stray half-swipe and a peek-and-go-back charge nothing; Auto-unlock off shows the card; Undo within 10 minutes returns the credits; a double tap and a mid-call airplane-mode toggle give one ledger row.
- [ ] Low balance pauses at the chapter's first page; after a top-up the reader lands on that page.
- [ ] Highlight toolbar: appears only after the finger lifts and the selection settles; never covers the selection; flips below near the top; docks at the bottom for very long selections; the phone's own copy menu never appears. Checked on at least three physical Android devices and Android System WebView versions.
- [ ] Highlights, notes and bookmarks survive app restart, a font size change, and a revision update; sync to a second device.
- [ ] Settings: font 14–28, line spacing, Light/Sepia/Dark, Pages/Scroll, all keep the position; Night is warm and highlights are dimmed; reduced motion honoured.
- [ ] Download a whole book and an owned-chapters book; airplane mode reading works for 7 days (clock set forward on a test device: license expires at 7 days and refreshes online); files on disk are ciphertext only.
- [ ] Passage discussion opens, posts, shows author badge, hides threads beyond the reader's position.
- [ ] Finish screen appears at the last page; discussion unlocks at 95%.
- [ ] All four app themes, 200% font scale, 360 px width checked on the reader chrome and every sheet.
- [ ] **pgTAP:** `unlock_chapter` (single charge on replay, `already_unlocked`, amount capped at remaining, price 0 chapters, completion creates the book entitlement, auto rejected when the setting is off, insufficient credits leaves no rows); `undo_chapter_unlock` (inside/outside 10 minutes, once only, 20% rule, blocked after book unlock, author earning reversed); RLS on `reading_progress`, `annotations`, `passage_comments` (position rule), `chapter_keys` (no client access); `sync_reading_progress` rejects positions beyond the gate; `max_percent` never decreases.
- [ ] **Vitest:** `positionToPercent` and `percentToParagraph` round trips against the manifest; CFI valid across `free` and `full` prefix files; re-anchoring by paragraph id and quote; toolbar placement function (above, below, docked, never intersects rects); idempotency-key reuse and pending-charge table; page and time-left maths; license expiry with a backward clock.
- [ ] **Webhook replay tests:** none in this flow.
- [ ] **Maestro:** one happy path: open a book, read past the preview, Auto-unlock a chapter, make a highlight, restart the app, same page and highlight visible.

## Not in this flow
Buying credits (flow 09). The club chat itself and the book room (flow 06). Reading rooms (flow 07). Text-to-speech, dictionary, translation, PDF reading. iOS. Bookmarks sharing.

## Open questions
- Bookmark control is not in the prototype; default is a button in Chapters > Bookmarks and in the controls. Confirm.
- Toolbar shows three colour swatches (default plus two); the settings list six. Show all six in a scrollable row?
- Undo anti-abuse default: refused after 20% of the chapter is read. Confirm the rule and threshold.
- Spoiler hiding in threads: assumed by paragraph position plus an optional "Hide until chapter…" the writer sets. Confirm or cut the option.
- Block screenshots in the reader (Android secure flag)? Default is yes, since it protects paid text; it also blocks readers sharing a page. Decide.
- Georgia is not freely licensed to bundle; default is a similar open serif labelled "Georgia-style". Confirm the font list.
- Peek length (300 words) and the 7-day offline license are defaults.
- Device limit of 3 for downloads is a default.
- Does a cancelled subscriber keep reading owned books online (assumed yes, from "unlocked books stay forever") but lose offline refresh (per prototype)?
- Should the first reading session on a new device ask before downloading over mobile data?
