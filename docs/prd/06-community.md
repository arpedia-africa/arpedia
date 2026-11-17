# Flow 6 · Community

**Build order:** 12 · **Depends on:** flows 1 (profiles, auth), 8 (author approval creates author communities), 10 (notification preferences), 14 (reports, sanctions, safety rules) · **Prototype:** app screens `s-community`, `s-dms`, `s-community-groups`, `s-discover`, `s-channel`, `s-msg-actions`, `s-report`, `s-blocked` (the author DM and author community screens `s-dm`, `s-dm-confirm`, `s-author-community` are specified in flow 8) · admin screens `community`, `channel` (Trust and safety area, sidebar "Community")

## Goal
A reader opens one inbox and sees every conversation they are part of: official channels, clubs, author communities, read-alongs, reading rooms and private messages. They can chat live, react, pin, report and block, and find new communities to join.

**Success looks like:** 40% of monthly active readers open Community at least once a week; median time from opening a channel to sending a message is under 15 seconds on a 3G connection.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Community (All) | `s-community` | Inbox of every conversation, Read together card, Discover card |
| Community (Unread) | `s-dms` | Same inbox filtered to unread, with Mark all read |
| Community (Groups) | `s-community-groups` | Groups only (no one-to-one messages), each with type and member count |
| Discover communities | `s-discover` | Search and join public communities, type filters |
| Club chat | `s-channel` | Chat for any group: header, pinned weekly reading, messages, composer |
| Message actions | `s-msg-actions` | Sheet on long-press: reactions, Reply, Share, Pin, Copy text, Report or block, Delete |
| Report or block | `s-report` | Reason picker, optional details, Also block |
| Blocked people | `s-blocked` | List of blocked users with Unblock and undo toast |

Reading rooms (`s-rooms`, `s-room`) are flow 7. Author profile, author DM and author community are flow 8.

## Behaviour
**Inbox (`s-community`, `s-dms`, `s-community-groups`)**
1. The inbox lists every conversation the user belongs to, newest activity first. A row shows avatar (initials if none), name, last message as "Sender: text" (one line, truncated), relative time and an unread count. Same as v25.
2. Row types and their badges: Author (DM with an author, or messages from the author), Live (a club or room with people reading now, see rule 25). Opening a row goes to `s-channel` (clubs, official), `s-author-community`, `s-room` (read-along rooms) or `s-dm` (DMs).
3. Filters All, Unread, Groups sit under the header. The numbers are conversation counts, not message counts. Unread shows only conversations with `unread_count > 0` and a "N conversations with new messages" line plus **Mark all read**. Groups hides one-to-one messages and shows "Type · N members" instead of the last message (clubs "Club", author communities "Author community", official "Official", read-alongs "Read-along"). New.
4. Mark all read sets `last_read_at = now()` on every membership of the user in one call. The Unread list empties and shows its empty state.
5. The unread count on a row caps at 99 and shows "99+". The Community tab shows the number of conversations with unread, capped at "9+". Muted groups (rule 20) are excluded from the tab count and show a quiet dot, not a number.
6. **Read together** card shows the user's reading rooms as stacked member avatars with "N friends reading now" and the book titles; tapping goes to `s-rooms`. **Discover communities** card goes to `s-discover`. Both cards show even when the inbox is empty (the inbox is never a dead end). New.
7. The header has two buttons: Reading rooms (`s-rooms`) and Discover (`s-discover`).

**Discover (`s-discover`)**
8. Search matches community name and description (case-insensitive, 2 characters minimum, 300 ms debounce). Type chips: All, Groups, Authors, Read-alongs, Official. Same as v25; type filters New.
9. Each card shows name, "Type · public · N members" (members shown as 1,240 and 12.4k above 10,000), a two-line description, and Join or Joined. Only public communities (`visibility = 'public'`) are listed. Private clubs are joined by invitation link only.
10. Join adds the user as `member`, switches the button to Joined and puts the community in the inbox. It does not open the chat. Tapping the card opens the chat (read-only preview of the last 20 messages for non-members of public groups).
11. Leaving a community: from the chat header menu, Leave. Owners cannot leave until they transfer ownership or the staff archive the group.

**Chat (`s-channel`)**
12. Header shows name, "N reading now · M members" (reading now only when above 0), back to inbox. Messages are grouped by day ("Today", "Yesterday", then "Mon 9 Nov"). Each message shows sender name (not for own messages), Author badge when the sender is the owning author, time (24 hour clock, device time zone), and reactions with counts.
13. The composer is a text field (1 to 2,000 characters, trimmed; Send disabled when empty). The user can post if they are a member, the group is not locked, `who_can_post` allows them, they are not muted or suspended, and slow mode has elapsed. Fixed (v25 said "You cannot post here" with no reason).
14. When the user cannot post, the composer is replaced by one sentence naming the reason: "Only Arpedia Team can post here. You can still react." / "Chat is locked by moderators." / "You are muted until 19 Nov." / "Wait 12 s before your next message." / "Join this community to post."
15. Slow mode (group setting, seconds) blocks a second message from the same user until the time passes and shows a countdown.
16. Sending is optimistic: the message appears at once with a clock; on failure it shows "Not sent. Tap to retry" and retries with the same `client_id` so it is never posted twice.
17. New messages arrive live over the conversation's WebSocket (Cloudflare Durable Object), and history loads over HTTPS. If the user has scrolled up, a "New messages" pill appears instead of jumping the list. Opening the chat marks it read up to the newest visible message.
18. Pinned weekly reading: if the group has a weekly read, a banner shows "This week: Book ch. X to Y" plus the owner's note (one line). Tapping opens the book in the reader (`s-reader`). New.
19. A shared highlight arrives as a **quote card**: quote text, book title, chapter, and an Open button. The quote is at most 300 characters and the sender must have access to that text (preview or unlocked), otherwise the server rejects it. New.
20. Chat header menu: Mute notifications (1 hour, 8 hours, 1 week, until I turn it back on), Leave. Muting only stops push and the unread number; messages still arrive.
21. Long-press (or tap the more button) on a message opens `s-msg-actions`.
22. Message-less group (no messages yet): empty state (below).

**Message actions (`s-msg-actions`)**
23. Quick reactions: thumbs up, heart, laugh, wow, sad, fire. One reaction per user per message; tapping the same one removes it, tapping another replaces it. Reply quotes the original (collapsed to one line) above the new message.
24. Actions shown depend on the message: Reply, Copy text for every visible message; Share only in public groups (opens the system share sheet with the text and a link `arpedia.africa/c/{group}`); Pin only for owner and moderators (the row is hidden for others, even though the prototype shows the "Club admins only" hint); Delete only on the user's own messages; Report or block only on other people's messages. Fixed (v25 offered Delete on everyone's).
25. Live: a group is Live when at least 2 members have the chat open (connected sockets on the group's Durable Object). Reading now = that live count, also pushed to the inbox for groups on screen.
26. Deleting your own message replaces it with "This message was deleted" for everyone. Replies to it keep a collapsed "Deleted message" quote. Moderator removal shows "Removed by a moderator".

**Report or block (`s-report`)**
27. Opens from Report or block on any message, post comment, review, profile or DM. Shows "Why are you reporting this?", reasons (list per content type, see flow 14), optional details (up to 500 characters), **Also block {name}** (off by default; copy "Hide her messages everywhere. She isn't told."), Cancel and Send report. Send is disabled until a reason is picked. Same as v25 plus New (block in same step).
28. After sending, a toast "Report sent. We'll look at it within 24 hours for serious reports and within 3 days for others." appears and the reported message is hidden for the reporter. The reporter is never shown to the reported user.
29. A user can report the same content once. A second attempt shows "You already reported this."

**Blocking and Blocked people (`s-blocked`)**
30. Blocking hides the blocked user's messages, reactions, posts and comments from the blocker everywhere (replies to them show "Message from a blocked person"), and stops the blocked user from starting a DM with them. The blocked user is not told and is not removed from shared groups.
31. Blocking an author hides their posts and stops author push notifications; the blocker is unfollowed from that author. They can still read the author's books.
32. The list shows name, "Blocked 2 Nov · from Grace Readers" (where it happened) and Unblock. Unblock is one tap, shows a toast "Sola B. unblocked" with Undo for 5 seconds. Undo re-blocks with the original date.
33. Staff and the user's own account are never blockable (button hidden).

## States and edge cases
- **Empty:** inbox with no conversations: "No conversations yet. Join a community or start a reading room" with buttons Discover and Reading rooms. Unread filter empty: "You're all caught up." Groups filter empty: "You haven't joined any groups yet." Chat with no messages: "Be the first to say something" and, for author communities, a prompt to introduce yourself. Blocked list empty: "You haven't blocked anyone."
- **Loading:** skeleton rows (6) for the inbox, skeleton bubbles for chat. Last 50 messages are cached on device so a chat opens instantly.
- **Error:** inbox load failure shows "Couldn't load your conversations" with Try again; a failed send keeps the text and shows retry.
- **Offline:** inbox and the last 50 messages of each opened chat are readable from the cache with an "Offline" bar. Sending queues messages (up to 5) and sends them in order on reconnect; reactions, pin, report are disabled with "Connect to do this".
- **Blocked users:** see rules 30 to 33. In a group of 3 or fewer people the blocker sees a hint "You blocked 1 member here."
- **Muted groups:** see rule 20 and 5. A staff-muted channel (24 hours, set in admin) shows "Moderators muted this channel until 15:00."
- **Deleted messages and accounts:** deleted-account senders show as "Deleted user"; their messages stay unless they asked for deletion, in which case they are anonymised.
- **Spam:** messages matching safety rules (flow 14) are hidden before delivery, the sender sees "Your message wasn't sent because it breaks our rules" for Hide and "Please remove the phone number" for the edit-and-resend rule. Link posting is blocked for accounts under 7 days.
- **Minors:** users under 18 (from date of birth) cannot be found in Discover member lists, cannot create clubs and receive no DMs except from authors they started the thread with. Everything else is the same. Flagged in open questions.
- **Images:** chat is text only in this flow. Profile photos are scanned on upload (flow 10); an avatar flagged as explicit is rejected and the user sees "Choose a different photo."
- **Large groups:** groups over 10,000 members (official channels) only show reactions as counts, no per-person list, and "reading now" is hidden.
- **Time:** Times in the inbox: now, 45m, 1h, 3h, 4d, then "10 Nov". Chat times are HH:mm.

## Data
Extends `groups`, `group_members`, `messages` from README.

| Table | Column | Type | Notes |
|---|---|---|---|
| `groups` | id | uuid pk | |
| | kind | enum `official, club, author, readalong, room, dm` | `room` is flow 7, `dm` has exactly two members |
| | name, description | text | name 3 to 60 chars |
| | avatar_url | text null | |
| | owner_id | uuid fk profiles | author for `author`, staff for `official` |
| | book_id | uuid fk books null | read-alongs, rooms |
| | visibility | enum `public, followers, private` | Discover lists only `public` |
| | who_can_post | enum `members, staff, owner_and_followers` | |
| | slow_mode_seconds | int default 0 | 0 to 3600 |
| | locked_until | timestamptz null | staff or owner lock; null = open |
| | muted_words | text[] | channel words, added to the global safety rules |
| | weekly_book_id, weekly_from_chapter, weekly_to_chapter, weekly_note | uuid, int, int, text | pinned weekly reading |
| | member_count | int | maintained by trigger |
| | archived_at | timestamptz null | |
| `group_members` | group_id, user_id | pk (both) | |
| | role | enum `owner, moderator, member` | max 5 moderators per author channel |
| | joined_at, last_read_at | timestamptz | unread = messages after `last_read_at` |
| | notify_muted_until | timestamptz null | far-future for "until I turn it back on" |
| | last_seen_at | timestamptz | set when the user's last socket on this group closes |
| | cost_ack_at | timestamptz null | DM cost notice acknowledged (flow 8) |
| `messages` | id | uuid pk (time-ordered) | |
| | group_id, sender_id | uuid | |
| | client_id | uuid | unique with sender_id, makes sends idempotent |
| | kind | enum `text, quote, system` | |
| | body | text null | 1 to 2000 chars; null once deleted or removed |
| | quote | jsonb null | `{book_id, chapter, cfi, text}` |
| | reply_to_id | uuid null | |
| | state | enum `visible, auto_hidden, removed, deleted` | |
| | spoiler_chapter | int null | flow 7 |
| | cost_credits, ledger_id | int, uuid null | DM charges (flow 8) |
| | created_at | timestamptz | index `(group_id, created_at desc)` |
| `message_reactions` | message_id, user_id, emoji | pk (message_id, user_id) | emoji limited to six values |
| `message_pins` | group_id, message_id, pinned_by, pinned_at | | max 3 per group |
| `user_blocks` | blocker_id, blocked_id, source_group_id null, created_at | pk (blocker_id, blocked_id) | |

View `inbox_rows` (per user): group id, kind, name, avatar, last message preview, last_at, unread_count, live flag, muted flag, member_count.

**RLS in plain words**
- A user reads messages only in groups where they are a member, or in public groups for the last 20 messages when browsing. Messages from users the reader blocked are filtered out.
- Nobody writes `messages`, `group_members` role or `groups` directly from the client. All writes go through the RPCs below. Users can update only their own `last_read_at`, `notify_muted_until` and `last_seen_at`.
- `user_blocks`: a user reads and writes only their own rows. The blocked user cannot see that the row exists.
- DM groups: readable only by the two members. Staff read a DM only through the report flow (see flow 14).
- Staff with Moderator or Super admin role can read any non-DM group and its members for moderation, logged to `audit_log`.

**Migration from v25:** import official channels, author communities, clubs and their last 90 days of messages with sender mapping by user id; drop older messages. Read-along rooms from v25 become `readalong` groups. Unread state starts fully read.

## Server
- **RPC `get_inbox(filter, limit, cursor)`**: filter is `all | unread | groups`. Returns `inbox_rows` for `auth.uid()`. Caller: any signed-in user.
- **RPC `mark_all_read()`** and **`mark_read(group_id, up_to_message_id)`**: update `last_read_at`. Member only.
- **Message path (no client-called send RPC):** the client sends `{client_id, body, reply_to_id, quote}` over its WebSocket. The Durable Object (DO) for the group checks from its cached membership: member, `who_can_post`, lock, active sanction, slow mode, length, rate limits and new-account limits, then calls the Worker `moderate-text` (flow 14) for muted words and links. It assigns the message id and time, broadcasts to connected members, acks the sender with the id, and writes to Postgres in batches (every 1 s or 50 messages) through RPC `persist_messages(batch)`, idempotent on `(sender_id, client_id)`. Errors to the sender: `not_member, locked, muted, slow_mode, rejected_by_rules, rate_limited`. A message matching a Hide rule is persisted with `state = auto_hidden`, a report is created, it is not broadcast, and the sender is not told which word matched. If the Postgres write fails the DO retries from its own storage queue; messages are never dropped.
- **RPC `delete_message(message_id)`** (called through a Worker with the user's JWT, then pushed to the DO): sender only; sets `state = deleted`, body kept 30 days if the message has an open report, otherwise nulled.
- **RPC `react(message_id, emoji | null)`**, **`pin_message(group_id, message_id)`**, **`unpin_message`** (owner and moderators only; pin max 3).
- **RPC `join_group(group_id)`**, **`leave_group(group_id)`**, **`set_group_mute(group_id, until)`**.
- **RPC `block_user(user_id, source_group_id)`**, **`unblock_user(user_id)`**: block also removes follow for authors and hides the blocker's pending DM threads.
- **RPC `search_communities(q, type, cursor)`**: public groups, trigram search on name and description, returns joined flag.
- **Durable Object `ConversationDO` (Cloudflare Workers, WebSocket Hibernation API), one per group, DM thread or reading room.** The client opens `wss://chat.arpedia.africa/c/{group_id}` with its Supabase JWT. The Worker verifies it against the Supabase JWKS; the DO checks membership (cached 60 s, refreshed from Postgres via RPC `get_group_access(group_id, user_id)`; a miss or ban closes the socket with code 4403). The DO broadcasts messages, reactions, pins, deletes, presence and typing. Idle sockets hibernate. History loads over HTTPS from Postgres (RPC `get_messages(group_id, before, limit)`), never from the DO. Unread counts reach the inbox through a per-user `InboxDO` socket opened on the Community tab and fed by group DOs.
- **Moderation push-down:** delete, staff decisions, mutes, bans, locks and block changes write to Postgres first, then the Worker calls the DO (`POST /do/{group_id}/enforce`), which updates its cache, hides or removes the message in live clients and closes sockets of banned or removed users. If the DO is unreachable Postgres still enforces, because every persist and every history read check state.
- **Push:** members with no open socket get FCM push from a Worker. The DO enqueues `push_fanout` (pgmq, flow 15) when a message is persisted, with group, sender and recipients; mentions (`@name`) and replies are flagged so "mentions and replies only" users still get them.
- **pg_cron `refresh_member_counts`** nightly to repair denormalised counts. **pg_cron `purge_deleted_messages`** daily for rule above.

## Admin side
Screens `community` and `channel` (sidebar Community, Trust and safety area).
- `community`: list of channels (146 in the prototype: 12 official, 134 author) with owner, who can post, type, members, messages in 7 days, open reports, status (Active, Quiet, Chat locked). Filters: type, status, open reports. Primary action **Create official channel** (name, description, who can post, visibility). Author channels are created automatically when an author is approved (flow 11) and cannot be created here.
- `channel`: staff can change visibility, who can post, slow mode and muted words on behalf of an author; Lock chat; Mute channel for 24 hours; mute or unmute members. Every change writes `audit_log`. Staff cannot remove the author as owner. Flagged messages list links to the report in flow 14. Members table shows role, message count, join date.
- Muted words set here add to the global safety rules; they never replace them.
- Roles: Moderator, Operations admin and Super admin can edit; Analyst and Support read only.

## Analytics
`community_opened` (source: tab, push, card), `inbox_filter_changed` (filter), `group_joined` (group_kind, source: discover, invite, auto), `group_left`, `message_sent` (group_kind, kind, has_reply, offline_queued), `message_reacted` (emoji), `message_pinned`, `message_deleted`, `discover_searched` (query_length, results), `report_started` and `report_sent` (content_type, reason, also_block), `user_blocked`, `user_unblocked` (undo: true|false).

## Done when
- [ ] On a real Android phone, inbox shows all group types, filters All, Unread, Groups work and counts match the unread rows; Mark all read clears them.
- [ ] A message sent by one phone appears on another within 2 seconds on 3G, in the right order, without duplicates after a forced retry.
- [ ] Composer states: a locked group, a muted user, slow mode and a staff-only channel each show their own reason.
- [ ] Report sheet sends a report, hides the message for the reporter, and Also block hides all of that user's content.
- [ ] Blocked list shows the right source, Unblock plus Undo restores state.
- [ ] Offline: cached inbox and chats open; queued messages send once on reconnect.
- [ ] All four themes, large text and reduced motion checked.
- [ ] pgTAP: RLS on `messages`, `group_members`, `user_blocks` (non-members and blocked users cannot read or post; DMs readable only by the two members); `persist_messages` idempotency on `client_id` and `get_group_access` results (locked, muted, banned, non-member). One Vitest suite with Miniflare for the Durable Object (membership cache refresh, enforcement push-down, write retry) is allowed because it protects moderation.
- [ ] Vitest: relative time formatter, unread cap (99+, 9+), member count format (12.4k).
- [ ] One Maestro E2E: open Community, join from Discover, send a message, long-press and react, report with Also block, open Blocked people and undo.

## Not in this flow
Images, voice notes, video, polls or file sharing in chat. Message editing. Typing indicators (the Durable Object supports them, no UI yet) and read receipts in channels. Threads. Creating clubs by readers (clubs are created by staff and authors at launch). Reading rooms (flow 7). Author DMs and posts (flow 8). Push delivery rules (flow 15).

## Open questions
0. Typing indicators: supported by the architecture but absent from the prototype. Default: off until designed.
1. Can readers create their own clubs? Default: no, staff and authors only; the prototype has no create-club screen.
2. Reaction set: prototype messages show crying and praying hands but the picker has only six. Default: six only.
3. "Seen" under a message (shown in the club chat prototype): default is DMs only.
4. Is the Arpedia Support thread a two-way chat that becomes a support ticket, or read-only with a Contact support button? Default: read-only welcome with Contact support (flow 14).
5. Minors policy (age 13 to 17): default in States section; confirm with legal.
6. Retention of deleted-message text for reports (default 30 days).
7. Is Live tag threshold (2 active members in 5 minutes) right?
8. Report sheet copy says "within 24 hours"; staff promise is 24 hours for High and 3 days for others. Default: copy updated as in rule 28.
