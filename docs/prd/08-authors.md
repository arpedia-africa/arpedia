# Flow 8 · Authors (follow, profile, message)

**Build order:** 11 · **Depends on:** flows 1, 3 (tip screen `s-tip`), 6 (groups, messages, blocks, reports), 9 (credit ledger and spend RPC), 11 (author approval and profile data) · **Prototype:** app screens `s-author`, `s-post`, `s-author-community`, `s-dm-confirm`, `s-dm` (reports reuse `s-report`) · admin screens `authors`, `author` (People area, see Admin side)

## Goal
A reader can meet an author: see their profile, books and posts, follow them, join their community, comment on their posts, and send them a private message for 5 credits. Authors get a direct line to their readers and earn from every message.

**Success looks like:** 30% of readers who finish an author's book follow that author within 7 days; 8% of followers join the author community; at least 60% of paid messages get an author reply within 3 days.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Author profile | `s-author` | Band with photo, counts, Follow, Message, Tip, community card, tabs Posts, Books, About |
| Discussion (post) | `s-post` | One author post with likes and comments |
| Author community | `s-author-community` | Public community chat hosted by the author, free messages |
| Message an author | `s-dm-confirm` | Cost explained once before the first message, with balance |
| Private message | `s-dm` | One-to-one thread with the author, cost shown per message |
| Tip | `s-tip` | Defined in flow 3; opened from the Tip button here |

## Behaviour
**Author profile (`s-author`)**
1. Header band shows photo (initials if none), name, "Arpedia author" badge, "N books · M posts · City, Country", bio (4 lines, "more" expands), then buttons **Following / Follow**, **Message · 5 cr** and **Tip**. The credit price comes from config, never hard-coded. Same as v25 plus New (Message shows cost, Tip beside it).
2. Stats row: followers (3.4k), readers (5.8k, distinct readers who unlocked or read 10% or more of any book), average rating (4.7★, from all live books, one decimal, hidden below 5 ratings).
3. Community card: "Ifeoma's Readers · Joined · public community · 860 members" with Open (goes to `s-author-community`). If not joined it shows Join. Authors without a community (not yet approved) show no card.
4. Tabs: **Posts** (newest first, each with relative time, title, two-line excerpt, likes, comments; opens `s-post`), **Books** (author's live books as cover, title, rating, price in credits; opens book page), **About** (full bio, location, genres, joined date, link to community).
5. **Follow** toggles instantly (optimistic), button reads "Following" with a check; tapping again asks "Unfollow Ifeoma?" with Unfollow and Cancel. Followers count updates. A user cannot follow themselves; the buttons are hidden on their own profile and replaced by **Edit profile** (flow 11).
6. Following drives: push for new books and posts (if the preference is on, flow 15), the Following count on Profile, and a "From authors you follow" rail on Home (flow 2).
7. Counts format: below 1,000 exact, then 3.4k, 12k.
8. Relative times: under 1 minute "now", under 1 hour "N min ago", under 24 hours "N h ago", 1 to 30 days "N days ago" (singular "1 day ago"), older "10 Nov" (add year if not this year). Fixed (v25 showed "2h ago ago").
9. If the viewer blocked the author: the profile shows "You blocked this author" with Unblock; books stay visible, posts and Message are hidden. If the author blocked the viewer: nothing changes visually, but Message shows "Messaging isn't available" (no reason given).
10. An author whose rights are suspended (admin) keeps their profile and books visible; Message, Tip and new posts are disabled with "Not taking messages right now".

**Discussion (`s-post`)**
11. Shows author name and time, title, full body, likes and comments counts, a like button (toggle, optimistic), the comment box and "Comments N total" (replies included). Same as v25.
12. Comments are listed oldest first, 20 per page with Load more. Each shows avatar, name, relative time, text, Reply and a more menu. The author's replies carry an **Author** badge. New.
13. Write a comment: 1 to 1,000 characters, trimmed; Send disabled when empty. Replies are one level deep: replying to a reply attaches to the same parent and starts with the name.
14. The more menu on a comment: Report or block (opens `s-report`), and Delete on the user's own comments. The author can also Delete any comment on their own post ("Comment removed by author" shows). Fixed (v25 had a red Report button on every comment).
15. Comments from blocked users are hidden for the blocker. Comments held by safety rules or auto-hidden by reports show "This content is under review" to the author and the commenter, nothing to others.
16. Comments are rate limited (see flow 14 safety rules): 5 per minute per user; new accounts under 7 days cannot add links.
17. A like or comment notifies the author (flow 15, batched) and a reply notifies the person replied to.

**Author community (`s-author-community`)**
18. Header on the orange band: name, "Public community · N members", host row with the author, **View profile**. Message line "Messages here are free". Chat works as in flow 6.
19. Shows the author's pinned post (if any) at the top and the recent messages, never only an empty state. Fixed.
20. A reader joins from the community card, from Discover, or from the profile. Following an author does not join automatically (default). Leaving is in the chat menu.
21. Who can post is set by the author (default members); the author and up to 5 moderators chosen by the author can pin, delete and mute within the community; staff overrule (flow 6 admin).

**Message an author (`s-dm-confirm`, `s-dm`)**
22. Tapping Message opens `s-dm-confirm` the first time the user messages this author (`cost_ack_at` empty). It states: "Messages to this author cost 5 credits each. They're private: only {Name} sees them. Her replies are free.", shows "Your balance 840 credits" and "Per message 5 credits", and the button **Start private chat**. Later taps go straight to `s-dm`.
23. `s-dm` header (orange): author name, "Private · Author · usually replies within a day". "Usually replies within..." appears only when the author has at least 5 replies in the last 30 days: "within a day" if the median is under 24 hours, "within a few days" otherwise.
24. A thread card at the top has View profile. A pinned notice repeats the cost. The composer says "Write a private message" and shows "5 credits" next to Send.
25. Sending: 1 to 1,000 characters. Credits are taken in the same step as the message is stored. Each sent message shows "· 5 credits" beside its time. The author's replies show no cost. New.
26. If the balance is under the price the send is blocked with a sheet "You need 5 credits. Your balance is 3." with **Get credits** (goes to credits and plans, flow 9) and Cancel. The typed text stays in the composer.
27. Failed sends (offline) show "Not sent. Tap to retry" and retry with the same `client_id`; a retry never charges twice. Credits are only charged for messages that are stored.
28. Only readers start threads; an author cannot message a reader first. Authors reply from Author Studio inbox and the app inbox at no cost.
29. Menu in `s-dm`: View profile, Report (opens `s-report`), Block (also unfollows and hides the thread), Mute notifications. Fixed (missing in v25). Reporting a thread makes the last 50 messages visible to staff for that report only.
30. A message is private to the two people. Staff cannot read a thread except the one a user reported.
31. A reader who has blocked the author cannot send; an author who blocked the reader makes sends fail with "{Name} isn't taking messages right now" and no charge.
32. Money: each paid message is a `credit_ledger` row (reason `message`, delta -5) with the author earning ₦1.60 per credit (₦8.00). Messages deleted later are not refunded; messages the author reports as abuse can be refunded by staff (flow 14).
33. The author's message list shows the reader's name, plan (Monthly or Quarterly or Yearly) and "Under 18" if applicable (see edge cases). Authors cannot see credits balances.

## States and edge cases
- **Empty:** Posts tab with none: "No posts yet. Ifeoma hasn't posted." Books tab with none: "No books published yet." Comments with none: "No comments yet. Be the first." DM thread with no messages: "Ask a question, say thanks or share what a chapter meant to you. 5 credits a message."
- **Loading:** skeleton band and list rows; stats show dashes until loaded. Post and comments load in parallel.
- **Error:** profile load failure shows "Couldn't load this author" with Try again; comment send failure keeps the text.
- **Offline:** profile, posts and the last opened threads are cached and readable. Follow, like, comment and send are disabled with "Connect to do this" (queued follows only; the rest need the server).
- **Deleted or suspended author account:** profile shows "This author is no longer on Arpedia", books stay available, threads become read-only, no credits refunded.
- **Minors:** readers aged 16 to 17 can follow, comment and message authors; authors see "Under 18" in the thread header and the safety rules (flow 14) auto-hide any message with sexual terms. Authors cannot export the contact details of a reader.
- **NSFW images:** author photos and post images are scanned on upload (flow 11); flagged images are rejected. Messages are text only.
- **Spam:** repeated identical comments (3 in 5 minutes), phone numbers and links from new accounts are blocked by safety rules.
- **Low credit trap:** the confirm screen shows the balance so the cost is known before the first spend; the message button never charges without a typed message.
- **Concurrent spends:** two sends at the same moment from two phones with 5 credits succeed for exactly one.
- **Deleted messages:** deleting your own DM replaces it with "This message was deleted" for both people; the credit stays spent.
- **Tip:** the Tip sheet is flow 3; here it must open with the author preselected and return to the profile.

## Data
| Table | Column | Type | Notes |
|---|---|---|---|
| `author_follows` | follower_id, author_id | uuid pk (both) | plus `created_at`; check follower <> author |
| `author_stats` | author_id | uuid pk | |
| | follower_count, reader_count | int | trigger and nightly job |
| | avg_rating | numeric(2,1) null | |
| | median_reply_hours | numeric null | last 30 days |
| | reply_sample_size | int | |
| `author_posts` | id, author_id | uuid | authored in Studio (flow 11) |
| | title (≤120), body (≤5000) | text | |
| | state | enum `draft, published, removed` | |
| | like_count, comment_count | int | |
| | published_at | timestamptz | |
| `post_likes` | post_id, user_id | pk | |
| `post_comments` | id, post_id, user_id | uuid | |
| | parent_id | uuid null | one level |
| | body | text | 1 to 1000 |
| | state | enum `visible, auto_hidden, removed, deleted` | |
| | created_at | timestamptz | |

Reused: `groups.kind = 'author'` (created on approval, owner is the author, `who_can_post` default `members`); `groups.kind = 'dm'` for private threads with `group_members.cost_ack_at`; `messages.cost_credits` and `ledger_id`; `credit_ledger` (reason `message`); `user_blocks`.

Config (`app_config`): `author_message_cost_credits = 5`, `author_message_max_chars = 1000`.

**RLS in plain words**
- Profiles, books, published posts and visible comments are readable by any signed-in reader. Drafts only by the author.
- `author_follows` rows are readable by the follower; the author reads only counts, not who follows (default). Nobody writes the counts.
- Comments are insertable only through the RPC, never by direct insert. A reader deletes only their own comments; the post author may mark comments on their own post `removed`.
- DM groups are readable only by the reader and the author. A reader cannot add a third member. Staff access follows flow 14.
- `credit_ledger` and balances are never writable by the client.

**Migration from v25:** import follows, posts, comments and likes; existing DMs become `dm` groups with `cost_credits = 0` for old messages. Existing author communities map to `author` groups.

## Server
- **RPC `follow_author(author_id)`**, **`unfollow_author(author_id)`**: idempotent; rejects self and blocked pairs; returns the new count.
- **RPC `get_author_profile(author_id)`**: profile, stats, community id and whether the viewer joined, `follows`, and whether messaging is available for the viewer.
- **RPC `like_post(post_id, liked)`**, **`add_comment(post_id, parent_id, body, client_id)`**, **`delete_comment(comment_id)`**: add checks length, rate limit, blocked words and sanctions (mute stops comments), notifies via `push_fanout`.
- **RPC `start_author_dm(author_id)`**: creates or returns the DM group, sets `cost_ack_at = now()` only when the client calls **`ack_dm_cost(author_id)`** from the confirm screen. Fails if the author is not an approved, active author or has blocked the reader.
- **RPC `send_author_message(author_id, client_id, body)`** (called over HTTPS through a Worker; afterwards the Worker tells the thread's DO to broadcast the stored message, and sends FCM if the author is offline): in one transaction it locks the reader's balance row, checks balance at least the config price, checks safety rules and daily DM limits (flow 14), inserts the ledger row (`message`, -price, author earning price x ₦1.60) and the message with `ledger_id`. Idempotent on `(sender_id, client_id)`. Returns the message, the new balance or an error `insufficient_credits, blocked, rate_limited, rejected_by_rules, author_unavailable`. Only the reader role may call it.
- Author replies and community chat use the flow 6 path (DO then `persist_messages`) and never charge. A reader's paid message is the exception: it is written to Postgres first by the RPC above and only then broadcast, never batched later, because money is involved.
- **pg_cron `author_stats_refresh`** nightly (reader and follower counts, rating, median reply time).
- **Realtime:** DMs and the author community run on the `ConversationDO` WebSocket (flow 6), one Durable Object per DM thread and per community; the DO checks membership and block state, broadcasts, then persists. `s-post` has no socket: comments load over HTTPS with pull to refresh and a 30 s poll while the screen is open.
- **Push (Cloudflare Worker, FCM):** follower fan-out for new posts and books (flow 15); DM push to the author when a message arrives, and to the reader when the author replies.

## Admin side
Screens `authors` and `author` (People area; most behaviour belongs to flows 11 and 13). This flow adds:
- `authors`: followers shown under the author name; a community column linking to the channel (`channel`, flow 6).
- `author`: header shows followers, readers and earnings; a folded block shows tips, messages and community counts. **Message** is the primary action (staff message to the author). More menu: Suspend author rights (stops new uploads, tips and messages; readers keep reading live books; open-month earnings held), Pause payouts.
- Staff cannot read author-reader DMs; they can see message counts and revenue only.
- Roles: Support and Operations admin view; Super admin suspends.

## Analytics
`author_profile_viewed` (source: book, search, post, community), `author_followed`, `author_unfollowed`, `author_tab_opened` (tab), `post_opened`, `post_liked`, `comment_added` (is_reply, is_author), `author_community_joined`, `dm_cost_notice_viewed`, `dm_started`, `dm_message_sent` (credits, is_first_with_author), `dm_blocked_by_balance` (balance), `dm_author_replied` (hours_to_reply), `tip_started_from_profile`.

## Done when
- [ ] On a real phone: open an author, follow and unfollow, count updates, see Posts, Books and About.
- [ ] Message flow: confirm screen shows the true balance and price, first message deducts exactly 5 credits and shows "· 5 credits", the author reply costs nothing.
- [ ] With 3 credits the send is blocked and Get credits opens; no ledger row and no message are created.
- [ ] A forced network retry after a send never charges twice.
- [ ] A blocked pair cannot message each other and nothing is charged.
- [ ] Comments: add, reply, delete own, Report or block from the menu; author badge shows on author replies.
- [ ] Offline reading of cached profile and threads works.
- [ ] All four themes, large text, reduced motion.
- [ ] pgTAP: `send_author_message` (balance check, one transaction, idempotent `client_id`, correct author earning, concurrent sends with one balance), RLS on DM groups and `author_follows`, `ack_dm_cost`.
- [ ] Vitest: relative time formatter, count formatter, reply-time bucket ("within a day").
- [ ] One Maestro E2E: open author, follow, start a DM, send one message, see the balance drop by 5.

## Not in this flow
Posting and replying as the author in Studio (flow 11); tip purchase screen (flow 3); author payouts (flow 13); author-initiated DMs, broadcasts to followers, paid subscriptions to an author, voice notes, image messages, comment likes, editing comments.

## Open questions
1. Do non-subscribers with 0 credits get any free message? Default: no, 5 credits needed (which needs a plan).
2. Should unanswered messages be refunded after 7 days? Default: no refund.
3. Does following auto-join the author community? Default: no.
4. Can authors see who follows them? Default: counts only.
5. Authors messaging a reader first (for example a thank-you)? Default: not allowed.
6. Admin brief lists tips at ₦5 a credit and plans differently from README; this file follows README (₦3 a credit, ₦1.60 author earning). **Resolved 16 Nov:** prototype, BRIEF.md and book-pipeline.md corrected.
