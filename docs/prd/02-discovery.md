# Flow 2 · Discovery

**Build order:** 2 · **Depends on:** flow 1 · **Prototype:** app screens `s-home`, `s-see-all`, `s-explore`, `s-explore-filter`, `s-search`, `s-search-typing`, `s-search-results`, `s-search-none`, `s-search-request`, `s-notifications`; admin screens `s-curation`, `s-curation-trending`, `s-curation-coming`, `s-genres`, `s-search-tuning`

## Goal
A reader can find a book to read in a few taps: Home rails, Top 10, Explore with filters, and search that understands partial words, author names and typos. Staff can shape Home and search without a release.

**Success looks like:** 60% of sessions open a book from Home, Explore or Search within 60 seconds; fewer than 5% of searches end with no results.

Books, authors and clubs come from other flows. Until flows 3, 8 and 12 ship, Discovery works against seeded books (Harmattan Letters and the other prototype titles) and shows only what exists.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Home | `s-home` | Greeting band, rails, Top 10 band, Browse genres |
| Top 10 books | `s-see-all` | Ranked list with movement and credit cost |
| Explore | `s-explore` | Genre chips and the whole catalogue as a list |
| Filter by genre | `s-explore-filter` | Sheet: genre, length, Show N books |
| Search | `s-search` | Empty state: recent, trending, genres, authors |
| Search · typing | `s-search-typing` | Suggestions after 2 letters |
| Search results | `s-search-results` | Top result, books, authors, clubs |
| Search · no results | `s-search-none` | Ask for the book, tips, close matches |
| Book requested | `s-search-request` | Confirmation sheet |
| Notifications | `s-notifications` | Feed with filters, New and Earlier |

## Behaviour
**Home (`s-home`)**
1. Top band shows the greeting ("Good morning" until 11:59, "Good afternoon" until 16:59, otherwise "Good evening", then the first name and a full stop), a search field, a credits chip (current balance, taps to Credits), an Explore grid button and a bell with unread count.
2. Sections follow `home_sections` order, hidden ones skipped. Launch order from the prototype: Trending this week, Arpedia authors, New arrivals, Top 10 books, Recommended for you, Browse genres. Each shelf scrolls sideways; See all goes to `s-see-all` (Trending, New arrivals, Top 10) or `s-explore` (Recommended).
3. **Trending this week** and **Arpedia authors** are curated lists (edited in Discover curation, see Admin side). **New arrivals** is automatic: books published in the last 30 days, newest first, honouring pins and excluded books. **Top 10** is automatic: the 10 most read books of the past 7 days (rule 10). **Recommended for you** is computed per reader (rule 11). **Browse genres** shows genre tiles with book counts.
4. Cards show cover, title, author. Tapping goes to the book page (flow 3). Authors shelf avatars go to the author page (flow 8 / file 08).
5. A subtitle under Recommended for you names the reader's picks: "Because you picked Fiction and Nigerian books". With no picks and no history it reads "Popular with new readers".
6. Continue reading is not on Home (it lives in Library).
7. The credits chip and bell badge update without a reload (balance and unread count are re-fetched on app foreground, after any spend, and every 60 seconds while Home is open; no Supabase Realtime).
8. First paint uses cached data from the last session (stale for up to 10 minutes) and refreshes in the background. Pull to refresh reloads.

**Top 10 (`s-see-all`)**
9. Each row: rank, cover, title, author, "Genre · N hr read · N cr" and a movement badge: ▲ n, ▼ n, — (same), or New (not in last week's top 10). Row tap opens the book page. The filter button opens `s-explore-filter`.
10. The ranking uses a weekly snapshot (`book_rankings`). "Most read" = number of distinct readers who opened the book for at least one reading session in the last 7 days, preview or unlocked (ties: more unlocks, then newer). Movement compares with the previous snapshot. Recomputed hourly; the Monday-to-Sunday window is not used, it is a rolling 7 days.
11. Recommended for you scoring (default): score = 0.6 × share of the reader's picked genres matched + 0.4 × popularity rank score. Excludes books the reader has unlocked, finished or saved. Computed by `get_recommendations`, cached per user for 6 hours. A reader with no genre picks gets popularity only.

**Explore and filter (`s-explore`, `s-explore-filter`)**
12. Header has the title, a search field that opens `s-search` (it is not typed into here) and a filter button. Under it, single-select genre chips: All plus the first 5 visible genres by book count (default; see Open questions). The list shows "Browse catalogue" with the count and a sort control.
13. Each row: cover, title, author, "Genre · N hr read", credit cost on the right. Whole row opens the book; there is no separate info button. A book in two genres appears once.
14. Sort options (default): Most read (default), Newest, Price low to high. The prototype shows only "Most read".
15. The list pages by 20 with infinite scroll (keyset on sort key plus id). The count updates with the filter.
16. Filter sheet: one genre (All by default) with the book count for each; Length: Under 150 pages (up to 75 credits), 150 to 300 pages (75 to 150 credits), 300+ pages (150 credits and up); multi-select, none selected means any. Reset clears both. The button reads "Show N books" and N is live (a count query on every change, debounced 250 ms). With N = 0 the button is disabled and reads "No books match".
17. Credit ranges come from the stored book price (flow 3 / pricing rules), not from page counts in the app. If pricing rules change, the labels must still say pages and credits that match (derive pages = credits × 2).

**Search (`s-search`, `s-search-typing`, `s-search-results`)**
18. Search opens with the keyboard up. Empty state shows, in order: Recent (up to 10 on this device, Clear removes all), Trending searches (top 5), Browse genres (6 tiles with counts, See all to Explore), Authors readers look for (6). Sections with no data are hidden, not shown empty.
19. Recent searches are stored on the device only. Tapping one runs it (a recent author or book goes straight to it).
20. Trending searches: queries from the last 7 days with at least 20 distinct searchers, excluding blocked words and queries with zero results, ranked by searchers. Each row shows count ("2.4k searches this week"). A trending query that maps to exactly one book or author opens it directly; otherwise it shows results.
21. Typing: suggestions appear after 2 characters, debounced 200 ms, up to 8 rows mixing books, authors, clubs and genres. The first row is always "Search for “<text>”". Matched letters are bold. Row sublines: "Book · <author>", "Author · …", "Book club · N members", "Genre · N books". A book that matched through a topic word says so ("topic “grace”"). Tapping a suggestion goes straight to that item.
22. Offline: suggestions search only books already in the reader's library and recent searches, and the screen says "Showing books in your library".
23. Results: a Top result card (best match, with rating, genre, reading time, "Read free preview" and "or unlock for N credits"), then Books (title, author, matching line from the story in a highlighted snippet, genre, cost), Authors (with Follow), Clubs (with Join). Scope chips: All, Books, Authors, Clubs, each with a count; a Filter button opens the filter sheet.
24. Story matches use only text from the free preview (first 10%) so search cannot leak locked text. The snippet is one sentence around the match, 120 characters at most.
25. Matching: words are matched as full words or prefixes, case and accents ignored, typos tolerated by up to 2 letters (words of 5 or more letters), synonyms expanded (Search tuning), author names included, books not yet released shown only if "Show unreleased books" is on (Search tuning) and labelled Coming soon. Ranking: exact title match, title prefix, author, promoted result (Search tuning), then text match weight and popularity.
26. A book listed in two genres appears once.
27. **No results (`s-search-none`):** says "<query> isn't on Arpedia yet" and offers "Ask for this book", spelling tips, and up to 3 close matches from "You might like" (most read books in the closest genre, or overall).
28. **Ask for this book:** saves one request per reader per normalised query (repeat taps do nothing but show the same confirmation) and opens `s-search-request`: "Thanks, <first name>. N readers have asked for “<query>”. We'll send you a notification if it comes to Arpedia." Done returns to Search.
29. When staff link a request to a book and that book is published, each requester gets one notification (kind `book_request_fulfilled`).

**Notifications (`s-notifications`)**
30. Header: "N new since you last checked", Mark all read, a settings button (opens flow 10 notification preferences), filter chips All (with new count), Books, Authors, Community. Sections New (unread) and Earlier (read).
31. A book alert shows the cover, a people alert shows the avatar, others show initials. Unread rows are tinted with a dot. Tapping marks the row read and opens its target (book, discussion, post, club, direct message, reader at the saved page, profile). A target that was deleted shows a toast "That is no longer available" and still marks read.
32. Mark all read marks every unread row (all categories, not only the filtered one). Feed shows the latest 50, loading older on scroll; items older than 90 days are removed.
33. Rows are created by other flows through `create_notification`; this flow owns the feed, the table and the unread count. A row is created only if the reader's notification preference for that kind is on (flow 10). Quiet hours affect push only, never the feed.

## States and edge cases
- **Empty:** Home with no live books shows "Books are on their way" and the curated authors; Explore with a genre that has no books shows "No books here yet. Try another genre."; notifications empty shows "Nothing yet. Follow authors and join clubs to hear from them."; search empty state hides empty sections.
- **Loading:** skeleton shelves and rows (cover blocks, no spinners); filter count shows a small skeleton on the button.
- **Error:** a shelf that fails shows an inline "Couldn't load. Try again." for that shelf only; the rest of Home stays. Search errors show under the box with Retry.
- **Offline:** Home and Explore show the last cached data with a "You're offline" bar; opening a book not in the library says "Connect to read" unless it is downloaded. Search and notifications work from cache.
- **Edge cases:** a book unpublished while on a shelf is dropped on next refresh; tapping a cached card whose book is gone shows "This book is no longer available". A Top 10 tie in rank gives both the same movement logic with the earlier tie-break. A very long title truncates at two lines. A query of only spaces or under 2 characters runs no search. Queries are trimmed, lowercased, collapsed and limited to 80 characters; the app never sends a query shorter than 2 characters to analytics.

## Data
| Table | Columns and notes |
|---|---|
| `genres`, `user_genres` | from flow 1. Add `book_count` view counting live books |
| `tags`, `book_tags`, `banned_tags` | `tags(id, name, slug, merged_into)`, `book_tags(book_id, tag_id)`, `banned_tags(word)`. Tags come from authors; staff merge and ban in `s-genres` |
| `home_sections` | `id`, `key` (trending, authors, new_arrivals, top10, recommended, coming_soon, genres), `title`, `kind` (curated, automatic, algorithm), `position` int, `visible` bool, `config` jsonb (for example `{"max_items":10,"rotate_weekly":true,"interest_weight":0.6}`), `updated_by`, `updated_at` |
| `shelf_items` | `section_id`, `item_type` (book, author), `item_id`, `position`, `pinned` bool, `excluded` bool. Live copy. Unique (section_id, item_type, item_id) |
| `shelf_drafts` | same shape as `shelf_items` plus `editor_id`; one draft per section. Publish replaces live rows in one transaction |
| `coming_soon_entries` | `id`, `book_id`, `teaser` text (max 140), `release_at`, `notify_count`; release time follows the book's schedule |
| `coming_soon_notify` | `entry_id`, `user_id`, `created_at` (the "Notify me" tap lives on the book page, flows 3 and 8) |
| `book_rankings` | `snapshot_at`, `book_id`, `rank`, `readers_7d`, `unlocks_7d`. Keeps the last 8 weekly snapshots plus the latest hourly one |
| `shelf_tap_counts` | `section_key`, `week_start`, `position`, `taps`. Incremented in batches by `log_shelf_taps` |
| `book_search_text` | `book_revision_id`, `chapter_id`, `offset`, `text`, `tsv`. Preview text only, written by the ingest worker (flow 12) |
| `search_events` | `id`, `user_id` null, `query_norm`, `result_count`, `tapped_type` null, `tapped_id` null, `created_at`. Kept 90 days, then aggregated |
| `book_requests` | `id`, `user_id`, `query_norm`, `status` (open, wishlist, linked, fulfilled, dismissed), `book_id` null, `created_at`, `fulfilled_at`. Unique (user_id, query_norm) |
| `search_synonyms` | `id`, `terms` text[] (a group that means the same), `created_by` |
| `search_promotions` | `id`, `query_norm`, `book_id`, `position` int (1 to 3), `expires_at` null, `created_by` |
| `search_settings` | one row: `typo_distance` (0 to 2, default 2), `include_authors` (true), `show_unreleased` (false) |
| `notifications` | `id`, `user_id`, `kind`, `category` (books, authors, community), `actor_id` null, `book_id` null, `title`, `body`, `target_type`, `target_id`, `created_at`, `read_at` null. Index (user_id, read_at, created_at desc) |

Search indexes: Postgres full-text (`simple` config plus unaccent) on titles, author names and `book_search_text`, with `pg_trgm` for typos and prefix suggestions.

**RLS in plain words**
- `home_sections`, `shelf_items`, `coming_soon_entries`: public read of visible, live rows; writes by staff RPCs only. `shelf_drafts`: staff only.
- `search_events`: reader inserts own rows through `log_search`; no reads except staff aggregates (Analyst, Operations admin, Super admin). `book_requests`: reader reads own; staff read all.
- `notifications`: reader reads and updates only `read_at` on own rows; inserts only through `create_notification`.
- `search_synonyms`, `search_promotions`, `search_settings`: public read through the search RPC only; staff write.

**Migration notes from v25:** import nothing for search. Import v25 curated Trending and Coming soon lists as the first drafts and publish them. Import v25 notifications from the last 30 days only.

## Server
| Function | Input | Output | Checks |
|---|---|---|---|
| `get_home(app_version)` | none | sections in order, each with items; unread count; credits | Visible sections only; per-section cache 60 s; recommended per user |
| `get_recommendations(user)` | none | up to 20 book ids | Rule 11; cache 6 h |
| `list_books(genre, length_bands, sort, cursor)` | filters | 20 books, count | Live books only; keyset paging |
| `count_books(genre, length_bands)` | filters | integer | Same filters as the list |
| `get_top10()` | none | ranked books with movement | Reads `book_rankings` |
| `refresh_rankings` (pg_cron hourly) | none | none | Writes snapshot; weekly copy Mondays 00:00 WAT |
| `suggest(q)` | text 2 to 80 chars | up to 8 mixed rows | Normalises; synonyms; trigram; hides unreleased unless setting on |
| `search(q, scope, filters, cursor)` | as listed | top result, books with snippet, authors, clubs, counts | Promoted results first, labelled; snippets only from `book_search_text` |
| `log_search(q, result_count, tapped)` | as listed | none | Rate limit 60 per minute per user; drops queries under 2 chars |
| `request_book(query)` | text | request count | Authenticated; one per user per normalised query; max 10 per user per day |
| `create_notification(user, kind, target, …)` | as listed | id | Service role only; checks preference; deduplicates same kind and target within 1 minute |
| `mark_notification_read(id)`, `mark_all_notifications_read()` | optional id | unread count | Owner |
| `publish_shelf(section_id)` | section | live rows | Staff with Curate Discover; max 10 books for Trending; pinned books keep position; audited |
| `rotate_trending` (pg_cron Mondays 06:00 WAT) | none | none | Only if section's weekly rotation is on: lowest 2 unpinned out, next 2 most read in |
| `merge_tags`, `set_genre_visibility`, `reorder_genres` | ids | rows | Staff; merge rewrites `book_tags`; hidden genres stay on books |
| `save_search_tuning(changes)` | synonyms, promotions, settings | rows | Staff; audited |
| `link_book_request(request_ids, book_id)` | ids | rows | Staff; on book publish a trigger fires `request_fulfilled` notifications |

## Admin side
| Screen | Prototype id | What staff do |
|---|---|---|
| Discover curation | `s-curation` | See all Home sections in order; drag to reorder (saved as you go); show or hide; see who last edited; open Edit. Automatic sections (New arrivals, Top 10) cannot be hand-ordered but accept pins and excluded books; Recommended edits the interest weight |
| Edit Trending this week | `s-curation-trending` | Add books, drag order, pin a book (keeps position through rotation), see changes not yet published, Discard or Publish changes; set weekly rotation; see last week's taps by position. Max 10 books. Live in the app within a minute |
| Coming soon entry | `s-curation-coming` | Pick a book, write a 140-character teaser, see the release date (follows the book's schedule; changing it changes the schedule), see the Notify me count. Warns if a copyright claim is open |
| Genres and tags | `s-genres` | Order and show or hide genres, see onboarding counts, apply merge suggestions, ban words. Hidden genres vanish from onboarding but stay on books. Banned words are stripped from new uploads and the author is told |
| Search tuning | `s-search-tuning` | See top searches (with tap-through rate) and zero-result searches ("Books readers want", with Add to wishlist), add synonyms, set promoted results (query, book, position, optional end date, labelled Promoted in the app), toggle typo tolerance, author names, unreleased books. Save changes writes one audit entry per change group |

Access: Publisher, Operations admin and Super admin curate Discover; Search tuning is Operations admin and Super admin (default). Every change is audited (flow 16). Nothing is sent to readers by curation.

## Analytics
`home_viewed`, `shelf_card_tapped` (section_key, position, book_id), `see_all_tapped` (section_key), `explore_opened`, `filter_applied` (genre, length_bands, result_count), `search_opened`, `search_suggestion_tapped` (type), `search_submitted` (query_length, scope, result_count), `search_result_tapped` (type, position), `search_no_results` (query_length), `book_requested`, `notification_opened` (kind), `notifications_marked_all`. Queries themselves are stored only in `search_events`, never sent to PostHog.

## Done when
- [ ] Home renders all sections from seed data on a 360 px low-end phone in under 2.5 s on throttled 3G, with skeletons first and cached data on second open.
- [ ] A staff change to Trending, published in the admin, shows in the app within 1 minute; Discard leaves the live shelf untouched.
- [ ] Typing "gra" suggests books, authors, clubs and genres with bold matches; "harmatan" finds Harmattan Letters; a snippet never shows text outside the first 10%.
- [ ] A search with no results lets the reader ask for the book, and the request shows under zero-result searches in the admin; linking it and publishing the book sends one notification.
- [ ] Filter sheet count matches the number of books shown after Show.
- [ ] Notifications feed shows New and Earlier correctly, Mark all read clears the badge on Home, and a deleted target does not crash.
- [ ] Offline: Home, Explore, Search suggestions (library only) and Notifications open from cache.
- [ ] pgTAP: RLS on `notifications` (owner only, no direct insert), `book_requests` (one per user per query), `search_events`, `shelf_drafts`; `publish_shelf` enforces max 10 and keeps pins; `create_notification` honours preferences; `rotate_trending` keeps pinned books.
- [ ] Vitest: query normalisation, recommendation score, rank movement (up, down, same, New), length-band to credit mapping, greeting by hour, snippet trimming, trending threshold.
- [ ] Maestro: open app, tap a Trending book, go back, search "grace", open the top result.

## Not in this flow
The book page and Notify me button (flow 3); author pages and Follow (flow 8, file 08); club pages and Join (flow 12 community, file 06); push delivery and campaigns (flow 15); notification preferences screen (flow 10); personalised ranking beyond genre picks; search by voice.

## Open questions
1. The app's genres (Fiction, Christian, Christian romance, Nigerian books, …), Explore chips (Christian & Faith, Drama, Fiction, Nonfiction, Romance) and the admin genre list (Christian & Faith, Clean romance, African stories, …) are three different lists. Default: one `genres` table, admin list is the source; decide the final launch list.
2. Explore chips: default is All plus the top 5 visible genres by book count.
3. Sort options beyond "Most read" (default adds Newest and Price low to high).
4. "Most read" definition (distinct readers in 7 days, rule 10) and the Top 10 refresh rate (hourly).
5. Recommendation weights (60% interests, 40% popularity) come from the admin note; the formula in rule 11 is a default.
6. Coming soon is a curated section in the admin but has no rail in the app prototype; where does it show (default: a Home rail after Top 10, hidden when empty)?
7. Search-text scope: default indexes the free preview only. Indexing the full text with preview-only snippets would find more books but risks revealing which locked books contain a phrase.
8. Trending threshold (20 searchers), suggestion count (8) and request limit (10 a day) are defaults.
9. Zero-result "Add to wishlist" statuses and who tells requesters when a book is declined (default: nobody is told).
10. Who may edit Search tuning (default Operations admin and Super admin) and whether Publishers may pin Top 10 books.
11. Notification retention (90 days) and feed size (50) are defaults.
