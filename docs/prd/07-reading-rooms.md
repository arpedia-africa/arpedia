# Flow 7 · Reading rooms

**Build order:** 13 · **Depends on:** flows 4 (reading progress, annotations), 5 (library), 6 (groups, messages, reports, blocks) · **Prototype:** app screens `s-rooms`, `s-create-room`, `s-join-code`, `s-room` · admin screens `rooms`, `room` (Trust and safety area, sidebar "Community")

## Goal
Readers read one book together. They create a room, invite friends with an 8-character code, see everyone's progress at a glance, chat without spoilers, and unlock shared annotations when they finish.

**Success looks like:** 25% of readers who open Reading rooms create or join one in their first month; rooms finish a book at twice the rate of solo readers of the same book.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Reading rooms | `s-rooms` | Promise band, Create room, Join with code, Your rooms with progress ring |
| Create a room | `s-create-room` | Room name, book, pace, who can join |
| Join with code | `s-join-code` | 8 boxes, paste, Join room |
| Room | `s-room` | Progress header, tabs Chat, Annotations, Members |

## Behaviour
**Reading rooms list (`s-rooms`)**
1. Shows the "Read together" promise on the sunflower band, buttons **Create room** and **Join with code**, then "Your rooms N". Same as v25.
2. Each room card shows room name, book title and cover, "N members · M finished", "Active today" or "Active yesterday" or "Active 3 days ago" (never a raw date, Fixed), and the viewer's own progress ring with percent. Rooms not started yet show "Starts Monday" and 0%.
3. Order: rooms with unread chat first, then by last activity. Ended rooms move to a folded "Finished rooms" list at the bottom.
4. "Finished" for a member means they reached 100% of the book (or the last page). Finished count updates live.

**Create a room (`s-create-room`)**
5. Fields: Room name (3 to 40 characters, trimmed; emoji allowed), Choose the book, Pace, Who can join.
6. Choose the book lists the books in the user's library, each once, with cover and title (Fixed: v25 listed The Alignment twice). One book must be selected. A book with only the free preview unlocked is allowed; members unlock for themselves.
7. Pace options: Free (no deadline), 3 ch. a week, 1 ch. a day. For paced rooms the screen shows "Finishes around 28 December", computed from the number of chapters not yet finished by the creator and the start date. Free shows nothing. New.
8. Who can join: **Invite code** (default; joining needs the code) or **Anyone** (the room also appears under Read-alongs in Discover and can be joined without a code).
9. Create room is enabled once a name and a book are set (New). On create the server generates the code, adds the creator as `host` and opens `s-room` with a sheet to share the code (system share sheet with "Join my reading room on Arpedia. Code GRACE24A" and a link `arpedia.africa/r/GRACE24A`).
10. A user can host at most 5 active rooms. At the limit, Create room shows "You're hosting 5 rooms. End one to start another."

**Join with code (`s-join-code`)**
11. Eight boxes, one per character. Characters A to Z and 0 to 9, entered in any case and shown upper case; spaces and hyphens are ignored (codes display as GRAC-E24A). Paste fills all boxes. New.
12. The button says what is missing: "Join room · 1 more character" until 8 are filled, then "Join room".
13. Errors in a message under the boxes, boxes stay filled: "We couldn't find a room with that code." (also used if the user was removed from that room), "This room has ended.", "This room is full." After 10 wrong codes in an hour the user waits 15 minutes: "Too many tries. Try again at 14:30."
14. Joining shows the consent line once per room: "Everyone in this room can see how far you are in {book}." with **Join** and Cancel. If already a member, the room just opens.
15. A user can be in at most 20 rooms.

**Room (`s-room`)**
16. Header (on the orange band): room name, "Book · code GRACE24A" (code visible to all members so they can invite), then everyone's progress as avatar + "Name · 72%" or "Name · done", the viewer first. New.
17. Tabs: **Chat**, **Annotations**, **Members N**.
18. Chat follows flow 6 rules (composer, reactions, report, block, delete own) and these changes:
   - Each message is stamped on send with the sender's chapter in this book (`spoiler_chapter`).
   - If the sender's chapter is ahead of the viewer's current chapter, the viewer sees "Spoiler from ch. 22 · tap to show" instead of the text. Tapping reveals it until the viewer leaves the chat. The viewer's own chapter is read from their current progress, so as they read, messages unlock. New.
   - Messages from people at or behind the viewer show normally. Members with no progress yet count as chapter 0.
   - Day separators show the weekday ("Sunday").
19. **Annotations** tab: members' highlights and notes on this book that they chose to share to the room. Locked until the viewer finishes the book: "Finish {book} to see everyone's highlights. You are at 72%." with a Continue reading button (`s-reader`). Sharing a highlight to a room is a toggle in the reader highlight menu (flow 4); default off. New.
20. **Members** tab: list with avatar, name, role (Host), progress bar and percent, "Finished 3 Nov" for finished. The host can mute a member for the room (1 hour, 24 hours, rest of the room) and lock the chat. Any member can leave (Leave room, confirm). The host leaving hands hosting to the longest-standing member; the last member leaving ends the room.
21. The host can end the room: "End room? Chat closes for everyone. The room and its progress stay visible." Chat becomes read-only and the room moves to Finished rooms.
22. Pace is a goal, not a rule: members behind the pace see a gentle line "You are 2 chapters behind the room" and nothing else. No push for being behind.
23. A removed or left member loses access; their past messages stay unless deleted by them.
24. Progress updates reach the header within 15 seconds of the reader turning a page, but only while the reader has the room's book open and the device is online. Offline progress appears after sync.

**Read together card (inbox)** is specified in flow 6 rule 6; its numbers come from the user's active rooms: members who read in the last 24 hours.

## States and edge cases
- **Empty:** no rooms: "Read a book with friends" with Create room and Join with code. Chat with no messages: "Say hello. Everyone's progress is above." Annotations with nothing shared (after finishing): "Nobody has shared a highlight yet." Members tab always has at least the host.
- **Loading:** skeleton cards for the list and header avatars for the room.
- **Error:** list or room load failure with Try again; create failure keeps the form and shows "Couldn't create the room. Check your connection."
- **Offline:** the list and the last 50 messages of opened rooms read from cache. Create, join and sending are disabled with "Connect to do this". Progress shown is the last synced value with "Updated 10:42".
- **Book later unpublished or taken down:** the room stays; reading the book follows the book's access rules (flow 3); the header shows "This book was taken down" and progress freezes.
- **Blocked users:** a blocked member's messages and annotations are hidden for the blocker; their progress row stays (members cannot hide from the room). Joining a room with a user you blocked shows a warning on the consent sheet.
- **Spoiler rule edge cases:** unknown sender chapter (progress never synced) is treated as chapter 0, so never hidden. A message that quotes text from the book uses the quote chapter if it is higher.
- **Minors:** accounts under 18 can join rooms and create Invite-code rooms; **Anyone** rooms are not available to them and they do not appear in public member lists. Flagged below.
- **New accounts:** accounts under 7 days can read and react but not post in rooms (safety rule, flow 14); the composer says "New accounts can post after 7 days."
- **Spam and NSFW:** text only; safety rules apply as in flow 6. Room names run through muted words; a blocked name is rejected with "Choose a different name."
- **Large rooms:** more than 100 members (author-hosted live reads) hide the per-person progress header and show "74 of 212 finished" instead; the Members tab is paginated 50 at a time.

## Data
| Table | Column | Type | Notes |
|---|---|---|---|
| `reading_rooms` | group_id | uuid pk fk groups | `groups.kind = 'room'`; chat uses `messages` |
| | book_id | uuid fk books | |
| | host_id | uuid fk profiles | |
| | code | char(8) unique | uppercase, alphabet without 0 O 1 I; generated server side |
| | pace | enum `free, three_week, one_day` | |
| | join_policy | enum `code, anyone` | |
| | starts_at | timestamptz | default now(); future date = scheduled |
| | state | enum `scheduled, live, ended` | scheduled becomes live at `starts_at`, host or staff ends |
| | max_members | int default 100 | |
| | ended_at, ended_by | timestamptz, uuid null | |
| | transcript_purge_at | timestamptz null | `ended_at + 90 days` |
| `room_member_progress` | room_id, user_id | pk | |
| | percent | numeric(5,2) | |
| | chapter_index | int | spoiler checks |
| | finished_at | timestamptz null | |
| | updated_at | timestamptz | |
| `room_members_muted` | room_id, user_id, until | | host mute |
| `room_code_attempts` | user_id, attempted_at, success | | throttling, purged after 24 hours |

Changes elsewhere: `group_members.role` gains `host` for rooms (alias of owner); `messages.spoiler_chapter` (flow 6); `annotations.shared_room_id uuid null` (flow 4 table).

**RLS in plain words**
- Members read their rooms, progress rows and messages. Non-members read nothing, including the code. A room's code is visible only to members.
- Nobody writes progress from the client directly; RPC `update_room_progress` (and a trigger on `reading_progress` for offline progress that syncs later) updates `room_member_progress` for every live room the user belongs to with that book.
- Annotations marked `shared_room_id` are readable by room members only when their own `finished_at` is set (enforced in the policy, not just the UI).
- Staff Moderator and Super admin read any room, and every open of a room page by staff writes `audit_log`.

**Migration from v25:** import v25 rooms and members with codes; progress rebuilt from `reading_progress`. v25 duplicate rooms for the same book and name are merged.

## Server
- **RPC `create_reading_room(name, book_id, pace, join_policy, starts_at?)`**: checks name length and muted words, book in the caller's library, hosting limit 5, 3 to 40 chars; creates group, room, host membership, code. Returns room and code.
- **RPC `join_reading_room(code)`**: normalises the code, applies throttle (10 failures per hour, 15 minute lockout), checks not ended, not full, not removed, room count under 20; adds member with progress row copied from current reading progress. Returns room id.
- **RPC `leave_reading_room(room_id)`**. Hosts cannot remove members (only mute); host actions are **`mute_room_member(room_id, user_id, until)`**, **`set_room_lock(room_id, locked)`**, **`end_reading_room(room_id)`** (host or staff; sets chat read-only, `ended_at`, `transcript_purge_at`).
- **RPC `get_room(room_id)`** and **`get_group_access`** (membership, host, mute and lock state for the DO cache): room, members with progress, viewer's chapter. **`get_room_annotations(room_id)`**: returns `locked: true` with no rows unless the caller finished.
- **Message path** is flow 6's (DO then `persist_messages`), with room extras applied in the DO: stamps `spoiler_chapter` from the caller's progress, applies the new-account restriction and host mute.
- **Realtime (Cloudflare Durable Object, flow 6 `ConversationDO` with `kind = room`):** chat, presence and progress events travel on the room's WebSocket. After a synced page turn (at most every 15 s) the app calls Worker `progress-sync` with its JWT, which writes `room_member_progress` through RPC `update_room_progress` and tells the room DO to broadcast the new percent. The DO also enforces host mute, lock and end live and closes sockets of removed members.
- **pg_cron `room_lifecycle`** every minute: scheduled to live at `starts_at`; marks rooms ended when no message and no progress change for 30 days; **`purge_room_transcripts`** daily deletes messages 90 days after end except those attached to a report snapshot.
- **Push (flow 15):** "Room starts in 15 minutes" to members, a member finished ("Bisi finished The Alignment") to members who opted into community messages, and chat mentions.

## Admin side
Screens `rooms` and `room`.
- `rooms`: tabs Live now, Scheduled, Ended recently (kept 90 days). Columns: room and book and host, participants, started, join code, open reports. Actions: Join silently, Cancel room (scheduled), Transcript (ended). Live participant count refreshes every 10 seconds.
- `room`: staff view with participants, chat transcript and each member's progress. Actions: **Join silently** (watch chat without appearing in the participant list; logged, host not told), **Lock chat** (host sees "Arpedia staff locked the chat"; Undo toast), **End room** (in the more menu; can be undone for 10 minutes), mute a member for this room only. Account-level mutes are made from a report (flow 14).
- Roles: Moderator and Super admin act; Support and Analyst read the list only.

## Analytics
`rooms_opened`, `room_created` (pace, join_policy, book_id), `room_join_attempted` (success, error), `room_joined` (via: code, link, discover), `room_left`, `room_ended` (by: host, staff, idle), `room_spoiler_revealed`, `room_annotations_unlocked`, `room_message_sent`, `room_finished_by_member` (days_since_join).

## Done when
- [ ] Live presence shows who has the room open; killing the app removes them within 30 seconds.
- [ ] Two real phones: create a room, share the code, join with pasted code, progress ring and header update within 15 seconds of a page turn.
- [ ] A message from a reader ahead of you shows the spoiler placeholder and unlocks as you pass that chapter.
- [ ] Annotations stay locked until finish and unlock on finishing, with the lock text correct.
- [ ] Wrong, expired, full and ended codes each show the right message; the 11th wrong try locks for 15 minutes.
- [ ] Host can lock, mute and end; ended rooms are read-only; staff Join silently is invisible to members and appears in the audit log.
- [ ] Offline, four themes, large text, reduced motion checked.
- [ ] pgTAP: RLS on `reading_rooms`, `room_member_progress`, annotation visibility before and after finish; `join_reading_room` limits and throttle; `create_reading_room` limit of 5.
- [ ] Vitest: code normalisation and alphabet, finish-date estimate for each pace, spoiler comparison (sender chapter against viewer chapter).
- [ ] One Maestro E2E: create room, join with code on a second account, send a message, read ahead, see the progress change.

## Not in this flow
Voice or video rooms, scheduled live events with RSVPs created from the app (staff and author events appear in admin only), room discovery beyond the Discover listing, public author live reads created in-app, per-chapter quizzes, badges for finishing.

## Open questions
1. How are scheduled rooms created? The create screen has no date field but the list and admin show "Starts Monday" and RSVPs. Default: RPC supports `starts_at`; UI keeps start now until a date field is designed.
2. Is "Anyone" public in Discover (default) or only no-code joining?
3. Maximum members per room (default 100) and rooms per user (default 20).
4. Minors and Anyone rooms (default above); confirm with legal.
5. Auto-end after 30 days idle: acceptable?
6. Are finished-member push notifications wanted (default on, falls under community messages preference)?
