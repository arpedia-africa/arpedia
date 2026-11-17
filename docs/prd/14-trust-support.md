# Flow 14 · Trust, safety and support

**Build order:** 14 · **Depends on:** flows 1 (roles, sign-in), 3 and 4 (book and review report entry points), 6 (chat, blocks, report sheet), 8 (comments, DMs), 9 (ledger), 10 (account, Contact support) · **Prototype:** app screens `s-report`, `s-blocked` (flow 6), `s-reviews` and `s-review-actions` (flow 3), the Report this book row on `s-book`, Report a problem on `s-reader-menu` (flow 4), `s-about` (Contact support), `s-notifications` · admin screens `reports`, `report`, `report-action`, `report-review`, `claims`, `claim`, `appeals`, `appeal`, `automod` (area 5 Trust and safety); `support`, `ticket`, `help`, `help-article` (area 6 Support); `unlock-return` overlay (on `user-credits`)

## Goal
Readers can report anything harmful in two taps and know it is being handled. Staff see one queue, act with the full context, and every decision is explained, auditable and appealable. Readers and authors who need help reach a person who can see their account and fix it.

**Success looks like:** 95% of High severity reports get a first decision within 24 hours and 95% of others within 3 days; 90% of support tickets get a first reply within 24 hours; fewer than 3% of decisions are overturned on appeal.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Report or block (app) | `s-report` | Reason, details, Also block (flow 6 owns the UI; this flow owns what happens next) |
| Review options (app) | `s-review-actions` | Report review, Hide this person's reviews |
| Report entry rows (app) | `s-book`, `s-post`, `s-dm`, `s-room`, `s-channel` | Where reports start |
| Contact support (app) | `s-about` | Email support@arpedia.africa |
| Reports queue | `reports` | Open reports, severity, content type, auto-hidden |
| Report detail | `report` | Message in context, reporter list, automatic checks, actions |
| Report: review | `report-review` | Review report with Mark as spoiler |
| Take action | `report-action` | Warn, mute 7 days, suspend 30 days, ban, user message |
| Safety rules | `automod` | Muted words, auto-hide, link and rate rules |
| Copyright claims, claim | `claims`, `claim` | Claims on books, decision with author response |
| Appeals, appeal | `appeals`, `appeal` | Appeal queue and decision |
| Support inbox, ticket | `support`, `ticket` | Tickets, replies, macros, notes, grant credits |
| Help articles, editor | `help`, `help-article` | Articles shown in app and website |
| Return a chapter charge | `unlock-return` | Give back a pay-as-you-read charge |

## Behaviour
**Reporting from the app**
1. Reports can be made on: message (including reading-room messages), discussion comment, review, post comment, author post, profile, book, DM. Entry points: message actions, comment menu, review ⋯ menu ("Report review: Spoilers, abuse or spam"), profile menu, book page "Report this book: Wrong content, copyright or abuse", DM menu. Fixed (v25 only allowed messages and discussions).
2. `s-reader-menu` "Report a problem with this book" (missing pages, wrong chapter, broken text) is not a conduct report. It creates a support ticket in category Book access with the book and chapter attached (flow 4 calls the same server function).
3. The reasons list depends on the content type. Union of reasons: Spam or scams, Harassment or bullying, Hate speech, Sexual content, Violence or threats, Self-harm, Copyright infringement, Spoilers, Impersonation, Something else. Messages, comments and DMs show the eight in the prototype sheet; reviews and discussions add Spoilers; profiles add Impersonation; books show Copyright infringement, Sexual content, Something else. Copyright on a book also creates a claim (rule 33).
4. Severity comes from the reason: High = Hate speech, Sexual content, Violence or threats, Self-harm; Medium = Spam, Harassment, Impersonation, Copyright; Low = Spoilers, Something else. Staff can change it. Default in `automod_settings`.
5. One report per reader per content item. A reader can send at most 20 reports a day (setting). Reporters need an account at least 24 hours old for their report to count towards auto-hide.
6. On send the server snapshots the content (text, sender, group, book, 5 messages either side for chat, the last 50 messages for a reported DM thread) so staff still see it if the sender deletes or edits it.
7. **Auto-hide:** when 3 different eligible readers report the same content (setting) it is hidden at once in the app and goes to the top of the queue with status Auto-hidden. High severity reasons Violence or threats and Sexual content hide at 1 report. The author or sender sees "This content is under review"; others see nothing or "This message is under review" in chat. Staff are alerted at the same time. Keep restores it.
8. The reporter gets a notification when staff decide: "We took action on your report." They are never told what the action was and the reported user is never told who reported.

**Reports queue (`reports`)**
9. Tabs Open, Assigned to me, Resolved, Auto-hidden, with counts. One row of content-type quick filters (All, Messages, Discussions, Reviews, Reading rooms, Posts, Profiles, Books, DMs). Filters button: reason, severity, assignee. Columns: severity, content (quoted text plus type, place, author), reason, reporters, age, status.
10. Order: severity, then oldest first. High items float to the top. Footer states the promise: High within 24 hours, others within 3 days. Items past promise show a late pill.
11. Statuses: Unassigned, assigned name, Auto-hidden, Resolved. Normal states are plain text; only exceptions get pills (late, auto-hidden, high).
12. A report is claimed with Assign to me (one assignee). Escalate to Super admin is available on every report; credible threats against a named person are escalated, and the Super admin decides about contacting the Nigeria Police Force and preserving logs (see Open questions).
13. Report detail (`report`): content in context with timestamps in WAT, reported user card (account age, prior warnings, other reports, messages sent, muted or banned), More details with reporters and their reason and comment, automatic checks (abuse score out of 100, links, new account, matched phrase), room or group link. Bottom bar: **Keep**, **Remove**, **Remove and act on user...**, Skip (key J). Report N of M with Back to queue.
14. **Keep** restores auto-hidden content and closes the report as dismissed. **Remove** takes it out of the app (kept for the audit trail) and closes. **Remove and act on user** opens `report-action`.
15. Review reports (`report-review`): decisions Keep, Remove, **Mark as spoiler**. Mark as spoiler keeps the review but blurs it behind "Tap to reveal" in the app, tells the reviewer why, and can be undone.
16. Reported DMs: staff see only the reported thread (last 50 messages), never other DMs. Staff can see who a user blocked, never message contents outside reports.

**Take action (`report-action`)**
17. Choices: **Warn** (message removed, formal warning added), **Mute 7 days** (cannot post in chats, rooms, discussions, comments or DMs, can read), **Suspend 30 days** (cannot sign in; subscription keeps billing and the message says how to cancel in the store), **Ban** (permanent; needs Moderator plus Super admin confirmation; credits not refunded). Every action removes the content.
19. A message to the user is pre-filled (editable): what was removed, which rule, that they can appeal in the app within 14 days. Sent as a notification, in-app notice and email. Option "Tell the N reporters" sends the neutral line.
20. Reason (required) and internal note (staff only) are stored. Primary button names the outcome: "Remove and mute 7 days".
21. Every action writes `moderation_actions` and `audit_log` with who, what, reason, report id. A warning count of 3 within 90 days proposes Mute 7 days automatically (suggestion only).
22. Sanctions are enforced in the database: `persist_messages`, `add_comment`, `send_author_message`, `create_reading_room` and review posting all check `active_sanction(user_id)`, and the Durable Object checks the same state so a mute applies to the live socket within seconds. Suspension revokes refresh tokens and blocks sign-in with "Your account is suspended until 12 Dec. You can appeal from the email we sent." A suspended reader can still open a link to appeal.

**Safety rules (`automod`)**
23. One page for: muted words (word or phrase, category, applies to everywhere, chat and DMs, reviews, action Hide, Hide and report, Blur and flag, Warn sender, hits in 7 days), report reasons and severities, auto-hide thresholds, link rules (block links from accounts under 7 days, block links in DMs to authors except arpedia.africa, allowed domains), rate limits (messages per minute, DMs per day, reports per reader per day), new-account restrictions (first 7 days no posting in rooms, reviews wait for day 3), spam detection (identical messages 3 in 5 minutes, same text in 5 channels in 1 hour, phone numbers in chat: hide and ask sender to edit).
24. Changes take effect for new messages at once, are written to `audit_log`, and only Moderators and Super admins can edit. Channel-level muted words add to these, never replace them.
25. Matching is case-insensitive, ignores repeated letters and common substitutions (0 for o). A word list is matched on whole words unless marked as phrase.

**Appeals (`appeals`, `appeal`)**
26. In the app a sanctioned user (or a rejected applicant or an author with a rejected book) sees the decision message with **Appeal** (up to 1,000 characters). One open appeal per decision, within 14 days of the decision. They get a push and email with the outcome.
27. Queue columns: appellant, what they appeal, original decision and decider, received, status (New gets a pill, In review plain). Promise: 3 days.
28. An appeal must be decided by a different staff member than the one who made the original decision; the buttons are disabled for the original decider with a one-line reason. Outcomes: **Uphold**, **Reduce** (for example to 7 days, restoring access at once if that time has passed), **Overturn** (restores content and access, removes the warning). The user's reply is sent with the decision.

**Copyright claims (`claims`, `claim`)**
29. Claims come from a web form or email, or from a book report with reason Copyright (rule 33). Types: Copyright, Plagiarism, Impersonation. Promise: decision within 7 days.
30. Detail shows the matching passages (similarity is a hint across flagged chapters, not a verdict), claimant evidence files, the author's response and a timeline. Decisions: **Reject claim**, **Ask author** (7 days to answer, reminder or extension), **Uphold and take down** (opens the book unpublish screen, book moves to Taken down (copyright)).
31. While a book is taken down, new unlocks stop and readers who already unlocked keep access until the claim is decided; author earnings for the book are frozen (released if rejected, held back if upheld). Authors always get a chance to respond unless the claim is an obvious full copy. The author is told why and how to respond.
32. A book held for a claim is kept out of Discover and the book stays in its current review state.
33. A Copyright report from the app creates a claim with the reporter as claimant (name from profile), status New, due in 7 days.

**Support (`support`, `ticket`)**
34. Tickets arrive by email (support@arpedia.africa through an inbound email webhook) and from the app (a book problem report, rule 2). Contact support in `s-about` opens an email with app version, device model and user id prefilled. A sender not matching an account creates a ticket without a user.
35. Tabs: Mine, Unassigned, Waiting on reader, Solved. First reply promised within 1 day: over-SLA tickets show a red hours chip, others show time left. Rows show subject, reader, category (Billing, Book access, Account, Author help, Bug, Other); channel and category are in Filters.
36. Ticket page: reply thread, status, assignee, **Reply to reader**, **Internal note** (never shown to readers), **Macros** (saved replies with variables like the reader's name and balance), Send, Send and solve, Grant credits (header action). Side panel: plan, credits balance, category; More details: device, recent transactions, store event technical names, joined date.
37. A reader reply reopens a Solved ticket for 7 days; later replies open a new ticket linked to the old one.
38. **Grant credits** (opens the people grant dialog): needs a reason and is logged. Support can grant up to 200 credits; up to 500 needs Operations admin; more needs a second staff member to approve and the reader is not told until approved. Removing credits needs Finance.
39. **Return a chapter charge (`unlock-return`):** available from the reader's credit ledger on any pay-as-you-read charge after the reader's own 10-minute undo has ended. Shows the book, chapter, charged time and how much of the chapter was read ("1 of 22 pages"). Reasons: Skipped ahead by mistake, Chapter didn't open or display, Wrong book. Effect: credits return at once as a staff return row, the chapter locks again, the author is not paid for it, logged with reason. Returns over 50 credits or more than 3 for one reader in 30 days need a Finance approver and do nothing until approved.
40. Reader and author help articles: the Help list has categories (Getting started, Credits and plans, Reading, Community, Authors, Account and privacy), each article has title, category, where it shows (App, Website, or both), status (Published, Draft), views and helpful votes in 30 days. Published articles are live within a minute; edits stay drafts until Publish, which creates a new version; older versions can be restored. Related articles show under each article. Articles under 70% helpful are flagged for rewriting.
41. In the app, Help reads published articles by category with search and a Was this helpful? vote. Offline, the last 20 viewed articles are cached.

## States and edge cases
- **Empty:** reports queue "Nothing to review. High items due next: none." Appeals empty "No open appeals." Support inbox empty "Inbox zero". Blocked list empty is flow 6.
- **Loading:** table skeletons, report detail shows content first and loads reporter details after.
- **Error:** an action that fails shows the error and keeps the report open; no partial moderation (action and audit log are one transaction).
- **Offline (app):** a report sent offline is queued and sent on reconnect with the original timestamp; the user sees "Report saved. It will send when you're online."
- **Edge cases:** reported content already deleted (the snapshot is used); reported user deleted their account (action recorded, nothing to sanction); report on a staff member's content goes to Super admin only; two staff acting at once (second sees "Zainab already decided this" and nothing changes); mass false reports on one reader (auto-hide still applies, but the item is flagged "Possible brigading" when reporters share signup date and device); minors (under 18) cannot be banned without Super admin review and are not shown Suspend 30 days with a subscription note; NSFW photo in a profile goes straight to High and is hidden at 1 report; spam accounts reported 6 times are suspended automatically for 24 hours pending staff.
- **Retention:** report snapshots and moderation actions are kept 3 years; DM contents in a report snapshot are purged 1 year after the report is closed; support tickets are kept 3 years.

## Data
| Table | Columns |
|---|---|
| `reports` | id, ref text unique (RPT-2026-1184), reporter_id, content_type enum (message, discussion_comment, review, post_comment, author_post, profile, book, dm), content_id uuid, reported_user_id, group_id null, book_id null, reason enum (spam, harassment, hate, sexual, violence, self_harm, copyright, spoilers, impersonation, other), details text ≤500, severity enum (high, medium, low), status enum (open, auto_hidden, resolved), outcome enum (keep, removed, spoiler, actioned, dismissed) null, snapshot jsonb, assignee_id null, escalated_at null, due_at, first_action_at null, resolved_at null, created_at; unique (reporter_id, content_type, content_id) |
| `moderation_actions` | id, report_id null, target_user_id, content_ref jsonb null, action enum (keep, remove, mark_spoiler, warn, mute, suspend, ban, lock_chat, restore), duration_days int null, reason, internal_note, message_to_user, decided_by, confirmed_by null, expires_at null, undone_at null, created_at |
| `user_sanctions` | id, user_id, kind (warn, mute, suspend, ban), starts_at, ends_at null, action_id, state (active, ended, overturned) |
| `automod_settings` | key, value jsonb (thresholds, severities, limits); `automod_words` (id, text, is_phrase, category, scope, action, created_by) |
| `appeals` | id, user_id, subject_type (sanction, application, book_rejection, content_removal), subject_id, text ≤1000, status (new, in_review, upheld, reduced, overturned), decided_by, decision_note, due_at (+3 days), created_at, decided_at |
| `copyright_claims` | id, ref (CLM-0412), book_id, claimant_name, claimant_contact, type, evidence jsonb, similarity jsonb, status (new, waiting_on_author, upheld, rejected), author_due_at, due_at (+7 days), decided_by |
| `support_tickets` | id, ref (TKT-3318), user_id null, email, channel (email, app), category, subject, status (open, waiting_on_reader, solved), assignee_id, first_reply_due_at, first_replied_at, solved_at, reopen_until, linked_ticket_id |
| `ticket_messages` | id, ticket_id, kind (reader, staff, note), author_id, body, macro_id, email_message_id, created_at |
| `support_macros` | id, title, body, category, variables |
| `help_articles`, `help_article_versions`, `help_votes` | article: slug, category, shows_in (app, web), current_version_id, state; version: title, body, edited_by, number; vote: article_id, user_id, helpful bool |
| `credit_returns` | id, ledger_id unique, user_id, chapter_id, credits, reason, requested_by, approved_by null, state (done, pending_approval) |

**RLS in plain words**
- Readers can insert a report about content they can see (through the RPC only) and read only their own reports (reason and time, no outcome details). They never read reports about them.
- Staff read and write by role: Moderator and Super admin on reports, sanctions, safety rules; Support on tickets and macros; Finance approves returns; Analyst reads counts only. `has_staff_role()` is checked in every policy.
- Appeals: the appellant reads their own; staff read all; the decider must differ from `moderation_actions.decided_by` (check constraint through the RPC).
- Support tickets: readers read their own tickets and non-note messages only.
- DM snapshots are readable only by staff on that report, with an audit entry.

**Migration from v25:** import open reports and open tickets with status mapped; v25 report reasons map to the new enum (v25 "Something else" stays other). Past warnings become `user_sanctions` rows of kind warn.

## Server
- **RPC `create_report(content_type, content_id, reason, details, also_block)`**: checks the user can see the content, dedupes, daily limit, builds snapshot, computes severity and due date, applies auto-hide rule and inserts alert; if `also_block`, also blocks the user. Returns report ref. Any signed-in user.
- **Trigger `report_after_insert`**: counts eligible distinct reporters; when threshold met sets content state `auto_hidden` and report `auto_hidden`; enqueues staff alert (bell and email to Moderators).
- **RPC `staff_decide_report(report_id, decision, action?, duration_days?, reason, internal_note, message_to_user, notify_reporters)`**: Moderator or Super admin. One transaction: updates content state, writes `moderation_actions`, `user_sanctions`, `audit_log`, enqueues notices. Ban requires a second Super admin call to `confirm_ban`. Cannot act on own content or when another staff already decided.
- **RPC `escalate_report(report_id)`**, **`assign_report(report_id)`**.
- **Worker `moderate-text`** (called by the conversation Durable Object, `add_comment` and review insert; rules cached from `automod_settings`, refreshed on change): muted word matching, links, phone numbers; returns allow, hide, hide_and_report, blur, warn.
- **RPC `create_appeal(subject_type, subject_id, text)`**: within 14 days, one open per subject; **`decide_appeal(appeal_id, outcome, reduce_to_days?, reply)`** rejects the original decider.
- **RPC `decide_claim(claim_id, decision, note)`**, **`ask_author_claim`**; takedown calls the book RPC from flow 12 and freezes earnings flag in `author_earnings`.
- **Worker `support-inbound-email`** (Resend webhook, signature verified): matches sender to profile, threads by ticket ref in subject and `In-Reply-To`, creates or reopens ticket, saves attachments to R2.
- **RPC `reply_ticket(ticket_id, body, solve)`**, **`add_ticket_note`**, **`assign_ticket`**; reply sends email through Resend and a push when the reader has the app.
- **RPC `staff_return_chapter_charge(ledger_id, reason)`**: Support or higher; checks charge is a chapter spend, not undone or already returned, reader's 10-minute window ended, then (if over 50 credits or more than 3 in 30 days) creates a pending approval for Finance; otherwise writes a credit ledger row of reason `refund` (labelled Staff return) with positive delta, removes the chapter entitlement, sets the author earning to zero for that spend, logs it. One transaction. Idempotent.
- **RPC `staff_grant_credits`** (flow 9) honours the limits in rule 38.
- **pg_cron `sla_watch`** every 15 minutes: marks late reports and tickets, alerts when a High report passes 12 hours. **pg_cron `sanction_expiry`** hourly ends mutes and suspensions. **pg_cron `purge_snapshots`** daily.
- **Live enforcement:** after a decision commits in Postgres, the Worker pushes it to the affected conversation Durable Object (hide or remove the message live, close sockets for a muted, suspended or banned user). The staff queue refreshes by polling every 10 s and on focus (no Realtime); new High reports also send a staff alert push through a Worker.
- **Image moderation:** a Worker checks profile photos and author images on upload (provider to be chosen); flagged images are rejected before storing.

## Admin side
All screens above. Roles: Moderator (reports, safety rules, appeals except own, claims view), Publisher (claims decisions with Super admin), Support (tickets, help, grant up to 200, unlock return up to 50), Finance (approves returns, removes credits), Super admin (bans, escalations, everything), Analyst (counts). Every decision and every setting change writes `audit_log`. Keyboard: J skips to the next item.

## Analytics
`report_started`, `report_sent` (content_type, reason, also_block), `report_auto_hidden`, `report_decided` (decision, action, hours_to_first_action, severity), `appeal_created`, `appeal_decided` (outcome, hours), `claim_created`, `claim_decided`, `ticket_created` (channel, category), `ticket_first_reply` (hours), `ticket_solved`, `credit_returned` (credits, reason), `help_article_viewed`, `help_vote` (helpful), `contact_support_opened`. Staff dashboards use these plus Postgres counts (Insights, flow 15).

## Done when
- [ ] From a real phone a reader reports a message, a review, a comment, a profile, a book and a DM; each appears in the queue with the right type, severity and snapshot.
- [ ] Three eligible reporters auto-hide content within 5 seconds; Keep restores it; one reporter on a threat hides it.
- [ ] Remove and mute 7 days: content removed, user cannot post anywhere for 7 days, notice and email arrive, reporter gets the neutral message; the same user suspended cannot sign in.
- [ ] Appeal flow: the original decider cannot decide; Reduce to 7 days restores access when time has passed.
- [ ] Ticket from an inbound email reaches the inbox, reply goes out by email, a reader reply reopens a solved ticket within 7 days.
- [ ] Return a chapter charge restores credits, relocks the chapter and removes the author earning; over 50 credits waits for Finance.
- [ ] Safety rule changes apply to the next message and are in `audit_log`.
- [ ] pgTAP: RLS on `reports`, `appeals`, `support_tickets`, `ticket_messages` (notes hidden), DM snapshot access; `staff_return_chapter_charge` (limits, idempotency, author earning zero, no double return); `create_report` dedupe and auto-hide threshold; `decide_appeal` different-decider rule; grant limits.
- [ ] Vitest: severity mapping, SLA due dates, muted word matcher (whole word, repeated letters, substitutions), sanction end dates.
- [ ] One Maestro E2E (app): report a message with Also block; one admin smoke path: open report, Remove and mute, see audit entry.

## Not in this flow
Machine-learning image moderation, live chat support, phone support, a public copyright web form (built as a simple hosted form feeding the claims table), reader-facing status page, automatic legal responses, the Policies pages (flow 16), data requests (flow 10 and 16), refunds and money support tools (flow 9).

## Open questions
1. Reason list: prototype sheet has Self-harm and Copyright but not Spoilers or Impersonation; admin has the reverse. Default: union by content type (rule 3).
2. Sheet copy says "within 24 hours"; promise is 24 hours High and 3 days others. Default: copy updated.
3. Support grant limit conflict: ticket note says 200, grant dialog says 500. Default: 200 Support, 500 Operations, above needs approval.
4. Who may contact police for threats (default: Super admin only) and the data retention for that.
5. Minor-specific rules (age 16 to 17) and a lower reporter threshold for content involving minors.
6. Reporter eligibility (24-hour-old account) and brigading flag are our default; confirm.
7. Is there an in-app ticket form (the prototype only has an email link)?
8. Which image moderation vendor (called from a Worker), if any, beyond word lists.
