# Flow 15 · Engage and insights

**Build order:** 15 · **Depends on:** flows 1 (profiles, device tokens), 2 (notification feed `s-notifications`), 6 and 8 (message and follow events), 10 (`s-notif-prefs`), 14 (alerts), 16 (staff roles, audit log) · **Prototype:** app screens `s-notifications` (flow 2), `s-notif-prefs` (flow 10), the Home announcement card (`s-home`) · admin screens `campaigns`, `campaign-new`, `campaign-confirm`, `banners`, `banner-edit`, `emails`, `email-template` (area 9 Engage); `analytics`, `analytics-growth`, `analytics-reading`, `exports` (area 10 Insights)

## Goal
Arpedia reaches the right reader at the right moment without being pushy: push notifications that respect preferences and quiet hours, in-app announcements and emails. Staff see how readers grow, read and spend, and can export data safely.

**Success looks like:** 25% push open rate on non-marketing pushes; fewer than 10% of readers turn push off in a month; staff answer "what happened this week" from Analytics without asking an engineer.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Notifications feed (app) | `s-notifications` | In-app list, filters All, Books, Authors, Community, Mark all read (flow 2 UI, data defined here) |
| Notification preferences (app) | `s-notif-prefs` | Choose what Arpedia tells you, quiet hours (flow 10 UI, data defined here) |
| Push notifications | `campaigns` | Sent, scheduled, drafts, automatic notifications |
| Compose push | `campaign-new` | What, Who, When, Review, lock-screen preview |
| Confirm push | `campaign-confirm` | Last look before sending to more than 1,000 readers |
| In-app announcements, edit | `banners`, `banner-edit` | Home top, Credits page, Modal on launch |
| Emails, edit email | `emails`, `email-template` | Wording of system emails |
| Analytics: Overview, Growth, Reading | `analytics`, `analytics-growth`, `analytics-reading` | Readers, hours, funnel, retention |
| Exports and reports | `exports` | Background CSV exports and scheduled reports |

## Behaviour
**Push types and rules (app)**
1. Every push has a type from `push_types`. Types: `club_message` (group message, mention or reply), `author_reply` (reply in a DM), `author_new_post` and `author_new_book` (from authors you follow, batched to 1 per author per day), `note_reply` (reply to your note or discussion), `reading_reminder` (not read for 3 days; at most 1 per week), `room_starting` (reading room starts in 15 minutes), `room_finished` (a room member finished), `new_arrival` and `offer` (marketing), `campaign` (staff push, marketing unless marked service), `credits_low` (balance under 30, once per period, currently off by staff switch), `renewal_failed` (day 1, 3, 5 of grace; never capped, cannot be switched off by the reader), `author_approved`, `book_approved`, `changes_requested` (author account events), `moderation_notice`, `appeal_decision`, `ticket_reply`, `report_actioned`.
2. Categories: **Messages** (club_message, author_reply, note_reply, room_*), **Authors** (author_new_*), **Reminders** (reading_reminder), **Marketing** (new_arrival, offer, campaign), **Account** (everything else). Account pushes are always sent, regardless of preferences, except the reader has turned off push in Android settings.
3. Preferences (`s-notif-prefs`, "Send me"): **Club and room messages** with options All messages / Mentions and replies only / Off; **Authors you follow: New books and posts** on/off; **Replies to your notes** on/off; **Reading reminders: A nudge if you haven't read in 3 days** on/off; **New arrivals and offers** on/off; **Quiet hours: Pause notifications 22:00 to 06:00** on/off. Defaults at first run: messages = Mentions and replies only, authors on, note replies on, reminders on, marketing on, quiet hours on. Saving shows no confirmation screen; a toast "Saved" appears and the change applies to the next push.
4. Quiet hours use the reader's time zone (device, default Africa/Lagos) and the window 22:00 to 06:00. During quiet hours Messages, Authors and Reminders are held and delivered at 06:00 (one summary push "5 new messages" if more than 3 are waiting; held pushes older than 12 hours are dropped). Account pushes follow the per-type table in Data (most are delivered at 06:00 when they fall in quiet hours and are never dropped). Marketing is also blocked 22:00 to 07:00 WAT for everyone, regardless of the reader's setting (platform rule).
5. Muting a group (flow 6) stops `club_message` for that group. Blocked users never generate pushes. A reader with the group chat open (socket connected) is not pushed for that group.
6. Collapse rule: messages from the same group within 5 minutes use one Android notification group ("Grace Readers: 4 new messages"). Tapping opens that chat.
7. Marketing cap: at most 2 marketing pushes per reader per rolling 7 days; readers at the cap are left out and counted as "skipped (cap)". Account and money pushes are never counted or capped.
8. Deep link on tap: book, author, reading room, group, post, Home, Library, Credits, Plans, or Discover section. A link to a deleted or unpublished target opens Home with a toast "That's no longer available".
9. First push permission: Android 13 asks at the first useful moment (after the first follow, join or first unlock), never on first launch. If denied, `s-notif-prefs` shows "Notifications are off in your phone settings" with Open settings.
10. Push content never includes private message text for DMs: it shows "New reply from {Author}". Group pushes show "Sender: first 80 characters".
11. Tokens: one `push_tokens` row per device; on sign-out the token is deleted; a token reported invalid by FCM is disabled.

**In-app feed (`s-notifications`)**
12. Each push also writes a feed row (except Marketing sent to everyone as `campaign`, which writes one only when the reader opened it). The list has New (since last check) and Earlier, filters All, Books, Authors, Community (Account items show only under All). Mark all read sets `read_at`. Unread rows are tinted with a dot; book alerts show the cover, people alerts show avatars.
13. Items are kept 60 days, 200 maximum. Empty state: "Nothing new. We'll tell you when a book you follow arrives." Feed items from muted groups or blocked users are not created.

**Push notifications admin (`campaigns`, `campaign-new`, `campaign-confirm`)**
14. List with tabs All notifications, Sent, Scheduled, Drafts and four numbers: sent this month, delivered %, opened %, turned push off %. Columns: notification (title, audience and reach, where it opens), when, status, delivered, opened, conversions (unlocks, joins, returns, follows within 24 hours of the push). Row actions: Duplicate, Send again to readers who did not open it, Pause and Cancel push (scheduled), Delete draft.
15. Compose reads top to bottom: **1 What to say** (title up to 65 characters, message up to 178, counters warn before the limit; opens: Book, Author, Reading room, App screen: Home, Library, Credits, Plans, Discover section); **2 Who gets it** (All readers, Subscribers, Lapsed 30 days, genre readers, Authors) with a live reach number and "N more are left out because they already got 2 marketing pushes this week"; **3 When** (Send now, or Schedule in WAT); **4 Review**. A lock-screen preview updates as staff type.
16. Reach counts only readers with a valid push token, push enabled for Marketing (or the push is marked service) and not in the cap. More options: A/B test the title (second title to 20% first, winner to everyone else after 2 hours), skip readers at the frequency cap (on by default), respect quiet hours (on; turning off needs Super admin and a reason, for urgent service messages only).
17. A schedule inside quiet hours (22:00 to 07:00 WAT) moves to 07:00 and says so. Schedule push asks for confirmation only when more than 1,000 readers will get it (`campaign-confirm` shows message, audience, time and "Readers cannot take back a push after it is delivered"); smaller pushes schedule straight away. A scheduled push can be paused or cancelled until it goes out.
18. Roles: Operations admin and Super admin send; Publisher and Moderator can draft and request review; Analyst reads. A campaign needs one reviewer other than the author when reach exceeds 10,000 (default; Open questions).
19. Automatic notifications (a fold under the list): author application approved, book approved and published, changes requested (includes first line of staff note), new chapter or update from an author you follow (batched), reading room starting in 15 minutes, credits running low (under 30, once per period, off at launch), renewal failed (day 1, 3, 5, cannot be capped). Each has an on/off switch (except renewal failed and security notices) and Edit wording; switching off is logged with who and when and shown as a warning line.
20. Delivered and opened come from FCM delivery receipts and app open events; conversions come from app events within 24 hours of the delivery; a reader who received two pushes within 24 hours counts the conversion for the later push only.

**In-app announcements (`banners`, `banner-edit`)**
21. Placements: Home top (up to 2 at once, orange card above Continue reading), Credits page, Modal on launch (1 per reader per day, highest priority first, others wait). Audience: All readers, Subscribers, genre, app version below a number. Fields: headline up to 48 characters, body up to 120, button label, button opens (book, author, room, app screen, or an arpedia.africa page only), optional image 1200 x 600 up to 300 KB, start and end dates, priority, dismiss button.
22. A banner switches itself off after its end date. Dismissed cards do not return for that reader. Saved banners reach phones within about 15 minutes (app config refresh on open and every 15 minutes). The list shows shown and taps with a tap rate; status Live, Scheduled, Ended, Draft.

**Emails (`emails`, `email-template`)**
23. Every system email in one table: trigger, last editor, volume and open rate (30 days from Resend). Edit subject, preheader and body with variable chips like `{{first_name}}`; an unknown variable blocks save. Emails with money or security content (receipt, renewal failed, verify) can be reworded but not switched off. Test email goes to the signed-in staff address. Saving creates a version; the next email uses it; past ones are unchanged. Payout and security wording is reviewed by Finance. Domain health is folded.

**Insights (`analytics`, `analytics-growth`, `analytics-reading`, `exports`)**
24. Date range 7 days, 30 days, 90 days, This year (default 7 days), times in WAT, compared with the previous period of the same length. Tabs Overview, Growth, Reading.
25. **Overview** numbers: daily readers (DAU), monthly readers (MAU) with DAU/MAU, reading hours with minutes per session, books finished (share of books started). Daily readers chart, top books by reading time (readers, hours, unlocks, finished %, rating), Most read today (readers with at least 30 seconds of session since midnight WAT), genre share of reading time, preview to unlock conversion by book length (under 150, 150 to 300, 300 to 450, over 450 pages).
26. **Growth**: installs, new subscribers (% of installs), day 30 retention, monthly churn; onboarding funnel (installed, signed up, picked interests, chose a role, finished profile, saw plans, subscribed) with the biggest drop pointed out; signups by source (Play Store search, shared book links, church referrals, Instagram, author referral codes, Unknown); retention by sign-up week (day 1, 7, 30; cohorts too young show "Day 30 on 2 Dec" and are not coloured); churn by plan with main reason; trial and promo conversion.
27. **Reading**: average pages per session, offline reading share, highlights made, paragraph discussions; reading hours by hour of day; how far readers get; highlights and discussions per book; most discussed paragraphs (author names, no personal data); reading room attendance (joined, stayed to the end, messages, unlocks after).
28. Every figure has a tap-to-explain line stating where it comes from. Numbers are rounded for display and never shown for groups under 5 people ("Fewer than 5").
29. **Exports:** choose what (Readers, Subscriptions, Transactions, Author earnings, Books, Reports), dates, columns. Files build in the background, appear in the list for 7 days with status Counting, Building, Ready, Failed, Expired; the creator gets a staff bell alert when ready. Personal-detail columns (email, phone) need Super admin plus a reason and are logged; Finance can export transactions and author earnings without contact details. Personal files are deleted after 7 days (NDPA 2023). Scheduled reports (monthly earnings statement, weekly KPI email, weekly safety summary, quarterly data-request log) email a link to named recipients; links need staff sign-in.

## States and edge cases
- **Empty:** app feed empty (rule 13). Campaign list empty: "No pushes yet. Compose your first." Analytics for a period with no data: "No data for this period" per chart, never zero lines drawn as flat success. A new reader with no history sees the Insights tabs normally (staff only screen).
- **Loading:** feed skeleton rows; admin charts skeleton with fixed height so the page does not jump. Analytics read from daily rollups, so load under 2 seconds.
- **Error:** push composer shows send failure with the batch that failed and a Retry for the failed part only. An analytics query timeout shows "This chart is taking too long. Try a shorter period."
- **Offline (app):** feed and preferences load from cache; changing preferences offline queues the change and shows "Saved on this phone. Will sync when you're online." Pushes held by FCM are delivered when the phone is back (FCM TTL 24 hours for non-urgent, 4 days for Account).
- **Edge cases:** a reader with push turned off in Android still gets the in-app feed and email for Account events; a reader with several devices gets the push on all devices, and reading it on one clears the others (collapse key per type and target); a reader switches time zone (quiet hours follow the device); a campaign targets a segment that changes before send (audience is resolved at send time, and the confirm reach number is refreshed at send, with a warning if it differs by more than 10%); an author deleted before a push about them sends (push skipped); two staff sending near-identical pushes (warning "Similar push sent 2 h ago"); a banner link to an unpublished book (banner hides itself); minors (under 18) receive no Marketing pushes at all and no offers; deleted accounts never receive anything; time of send during a Nigerian public holiday has no special handling.
- **Privacy:** analytics events carry the user id as a hashed id in PostHog; no message text, no names; exports with personal data follow rule 29.

## Data
| Table | Columns |
|---|---|
| `push_tokens` | id, user_id, token (unique), platform (android, ios), device_id, app_version, last_seen_at, disabled_at null |
| `notification_prefs` | user_id pk, messages_level enum (all, mentions, off) default mentions, authors_new bool, note_replies bool, reading_reminders bool, marketing bool, quiet_hours_on bool default true, quiet_start time default 22:00, quiet_end time default 06:00, timezone text default 'Africa/Lagos', updated_at |
| `push_types` | key pk, category enum (messages, authors, reminders, marketing, account), enabled bool (staff switch), can_reader_disable bool, bypass_quiet bool, collapse_key text, ttl_seconds, title_template, body_template, updated_by |
| `notifications` | id, user_id, type, category enum (books, authors, community, account), title, body, data jsonb (target kind and id), actor_id null, book_id null, read_at null, created_at; index (user_id, created_at desc) |
| `push_log` | id, user_id, type, campaign_id null, status enum (queued, sent, delivered, opened, skipped_cap, skipped_quiet, skipped_pref, failed), skip_reason, sent_at, delivered_at, opened_at; partition by month, kept 90 days |
| `campaigns` | id, title ≤65, body ≤178, audience jsonb (kind, genre_id, filters), open_target jsonb, send_at null, status enum (draft, scheduled, sending, sent, paused, cancelled), is_service bool, ab_test jsonb null, respect_quiet bool, reach int, created_by, reviewed_by null, sent_at, counts jsonb (delivered, opened, conversions) |
| `banners` | id, placement enum (home_top, credits, launch_modal), headline ≤48, body ≤120, button_label, target jsonb, image_url null, audience jsonb, starts_at, ends_at null, priority int, dismissible bool, state enum (draft, scheduled, live, ended) |
| `banner_dismissals`, `banner_daily` | dismissals: banner_id, user_id; daily: banner_id, day, shown, taps |
| `email_templates`, `email_template_versions` | template: key, trigger, can_disable bool; version: subject, preheader, body, number, edited_by, created_at |
| `analytics_daily` | day date, metric text, dim jsonb (plan, genre, source, book_id, hour), value numeric; unique (day, metric, dim); built nightly and hourly for today |
| `exports`, `export_schedules` | export: id, kind, params jsonb, includes_pii bool, reason, created_by, status, row_count, file_key (R2), expires_at, created_at; schedule: report kind, recipients, cron, last_sent_at |

Quiet-hours handling per type (default): `club_message`, `author_*`, `reading_reminder`, `note_reply`, `room_finished`: held to 06:00. `room_starting`: not held, dropped if it falls in quiet hours. `renewal_failed`, `ticket_reply`, `moderation_notice`, `appeal_decision`, `report_actioned`, `author_approved`, `book_approved`, `changes_requested`: delivered at 06:00 when in quiet hours (never dropped). Marketing: dropped for that reader if the send time is in 22:00 to 07:00 WAT; campaigns are scheduled outside it.

**RLS in plain words**
- A user reads and updates only their own `notification_prefs`, `push_tokens` (insert, delete) and `notifications` (read, set `read_at`). Nobody else can read them. Clients never write `push_log`, `push_types`, `campaigns`, `banners`.
- Staff with Operations admin and Super admin write campaigns, banners, push types, templates; Publisher and Moderator draft; Analyst and all staff roles read `analytics_daily` aggregates (no personal rows). Exports are readable by their creator and Super admin.
- Readers can read active banners that match their audience through an RPC, never the table.

**Migration from v25:** import notification preferences (map v25 toggles to the new columns, defaults for missing), existing push tokens are re-registered at first open of the new app; v25 notification history is not migrated.

## Server
Everything server-side TypeScript runs on Cloudflare Workers; Postgres holds queues (pgmq) and schedules (pg_cron).
- **RPC `get_notifications(category, cursor)`**, **`mark_notifications_read(ids | all)`**, **`get_notification_prefs()`**, **`set_notification_prefs(patch)`**, **`register_push_token(token, device_id, platform, app_version)`**, **`remove_push_token`**.
- **RPC `get_active_banners(placement)`**: audience match, priority, one-modal-per-day and dismissals; called on app open and every 15 minutes.
- **pgmq queue `push_fanout`:** every producer (message persisted by the conversation DO, author post, room start cron, flow 12 book approval, flow 14 decisions, billing events) inserts `{type, user_ids | audience, data}`. **Worker `push-dispatcher`** reads the queue and for each recipient: loads prefs and `push_types`, applies enabled switch, preference, mute and block, quiet hours (hold in `push_held`, released by pg_cron at 06:00 per time zone group), marketing cap (count of marketing rows in `push_log` last 7 days), collapse and batching (author posts 1 per author per day), then sends through FCM (Expo push service) in batches of 100, writes `push_log` and the feed row, retries on 5xx with backoff (3 tries) and disables dead tokens.
- **Worker `campaign-runner`:** triggered by pg_cron every minute for due campaigns; resolves the audience at send time (SQL function `resolve_audience(campaign_id)` returning user ids), applies caps and quiet hours, enqueues to `push_fanout` in chunks of 1,000, updates counts; A/B tests send variant B to 20% then the winner (higher open rate) after 2 hours. Idempotent: campaign state moves `scheduled` to `sending` to `sent` by compare and set so a double run cannot send twice.
- **Worker `fcm-receipts`:** processes FCM and Expo receipts; sets `delivered_at`, disables tokens on `DeviceNotRegistered`. `push_opened(push_id)` is called from the app when a push is tapped.
- **RPC `staff_save_campaign`, `staff_schedule_campaign`, `staff_pause_campaign`, `staff_cancel_campaign`:** check role, text limits, quiet hours (move to 07:00), confirmation flag when reach is above 1,000, second reviewer above 10,000; write `audit_log`.
- **RPC `staff_save_banner`, `staff_end_banner`**; **RPC `staff_save_email_template`** (validates variables, creates version).
- **Worker `email-sender`** (Resend): renders the latest template version, sends, stores Resend ids; **Worker `resend-webhook`** updates opened and bounce data.
- **pg_cron `analytics_rollup`:** hourly for today and nightly for the last 3 days, filling `analytics_daily` from `reading_sessions`, `subscriptions`, `credit_ledger`, `entitlements`, `messages`, `reading_rooms`, `profiles`; installs and store data come from PostHog and store exports via a nightly Worker `analytics-import`. A backfill RPC rebuilds a date range.
- **Worker `export-builder`** reads pgmq `export_jobs`, streams rows to CSV in R2, sets status and bell alert, deletes expired files (pg_cron daily); PII exports check role and reason in `staff_create_export`, which writes `audit_log`.
- **pg_cron `reading_reminders`** daily 18:00 in each time zone group: readers not reading for 3 days with an unfinished book, at most one per week, enqueue `reading_reminder`.

## Admin side
All Engage and Insights screens above. Sidebar: Engage (Push notifications, In-app announcements, Emails), Insights (Analytics, Exports and reports). Header actions: one primary (New notification, New announcement, New export). Staff roles: Operations admin and Super admin send and publish; Analyst reads analytics and exports without personal data; Finance exports transactions and earnings. Every send, pause, cancel, switch change and export writes `audit_log`.

## Analytics
App events (PostHog; feed `analytics_daily`): `push_permission_prompted` and `push_permission_result`, `push_received` (type), `push_opened` (type, campaign_id, target), `notification_feed_opened`, `notification_item_opened` (type), `notif_prefs_changed` (field, value), `quiet_hours_changed`, `banner_shown` and `banner_tapped` (banner_id, placement), `banner_dismissed`, `session_start` and `reading_session` (seconds, offline, pages), `book_unlock` (flow 3), `install` and funnel steps (`signup_completed`, `interests_picked`, `role_chosen`, `profile_finished`, `plans_viewed`, `subscribed`), `highlight_created`, `paragraph_comment_created`. Staff events: `campaign_scheduled`, `campaign_sent` (reach, audience), `campaign_cancelled`, `export_created` (kind, includes_pii).

## Done when
- [ ] On a real Android phone: set each preference and receive (or not) the matching push; a group mute and a block stop pushes; quiet hours hold messages to 06:00 and release one summary.
- [ ] A push to 5 test devices with 2 at the marketing cap reaches 3 and logs 2 skipped.
- [ ] Staff compose, schedule inside quiet hours (moves to 07:00), confirm above 1,000, and the push arrives on time with the right deep link; Cancel stops it.
- [ ] Notification feed shows each push with correct category filters; Mark all read works; deep links open the right screen.
- [ ] A banner on Home top and a launch modal show once per day, honour dismiss and end date.
- [ ] Analytics numbers match a SQL check for one day (DAU, reading hours, unlocks) within 1%.
- [ ] An export with emails is refused for Finance, allowed for Super admin with a reason, and expires after 7 days.
- [ ] Offline: feed and preferences load from cache; preference change syncs on reconnect.
- [ ] Four themes, large text, reduced motion on the app screens.
- [ ] pgTAP: RLS on `notifications`, `notification_prefs`, `push_tokens` (only own rows), `analytics_daily` (staff only, no personal columns), `exports` visibility; `staff_schedule_campaign` rules (quiet hours move, confirm flag); marketing cap SQL function.
- [ ] Vitest: quiet-hours calculation across time zones including windows that cross midnight, marketing cap counting, batching (1 per author per day), A/B winner choice, retention cohort maths, rollup arithmetic.
- [ ] Replay test for FCM receipts arriving twice and out of order (webhook-style test allowed by BUILD.md for payments; here one idempotency test on `push_log` status moves forward only).
- [ ] One Maestro E2E: turn a preference on, receive a pushed new-post notification, tap it, land on the author post.

## Not in this flow
SMS and WhatsApp messages, email campaigns to readers (only system emails), per-reader personalised recommendations pushes, segment builder with custom rules beyond the five audiences, real-time dashboards, author-facing analytics (Author Studio flow 11 and 13), A/B testing beyond the push title, web push, iOS-specific behaviour.

## Open questions
1. Quiet hours: reader setting is 22:00 to 06:00 (prototype) and staff rule 22:00 to 07:00 WAT. Default: both apply (rule 4).
2. Is a second reviewer required for large campaigns (default: above 10,000 readers)?
3. Who owns the `notifications` table and feed API: this flow or flow 2? Default: this flow defines it, flow 2 only renders it.
4. Minors receive no marketing at all (default); confirm with legal.
5. Reading reminders are not in the staff automatic list but are in reader preferences; default adds a staff switch under Automatic notifications.
6. FCM only for Android; iOS APNs setup deferred until iOS launch.
7. Is `credits_low` going live at all (staff turned it off on 11 Nov)? Default: off.
8. Analytics source for installs (Play Console exports versus PostHog) and whether staff need a manual correction tool.
