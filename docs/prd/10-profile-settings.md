# Flow 10 · Profile and settings

**Build order:** 10 · **Depends on:** flows 1, 4 (annotations, reader), 6 (credits, plans), 7 (downloads) · **Prototype:** app screens `s-profile`, `s-goal`, `s-my-highlights`, `s-account`, `s-theme-settings`, `s-notif-prefs`, `s-edit-profile`, `s-security`, `s-about`, `s-delete-account`; admin screens `s-users`, `s-user`, `s-user-activity`, `s-user-delete` (plus tabs and actions that belong to other flows, see Admin side)

## Goal
A reader can see their reading life at a glance, set a yearly goal, find every bookmark, highlight and note, and manage their account: profile, colour, notifications, sign-in methods, devices and deletion. Support can look up and help a reader without engineers.

**Success looks like:** 90% of support questions about account, devices or credits are answered from the admin reader page; deletion requests are completed within the legal 30 days with no manual database work.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Profile | `s-profile` | Stats, reading goal band, collection, Become an author |
| Reading goal | `s-goal` | Sheet: 6, 12, 24, 52 or own number |
| My highlights | `s-my-highlights` | Tabs Bookmarks, Highlights, Notes, grouped by book |
| Settings | `s-account` | All account and app settings |
| App colour | `s-theme-settings` | Sheet: four colours, applies at once |
| Notification preferences | `s-notif-prefs` | Five toggles and quiet hours |
| Edit profile | `s-edit-profile` | Photo, name, bio, phone, birthday, country |
| Security | `s-security` | Sign-in methods, change password, devices |
| About and help | `s-about` | Help centre, support, legal, copyright report |
| Delete account | `s-delete-account` | What is lost, typed confirmation |

## Behaviour
**Profile (`s-profile`)**
1. Header: title, settings gear (to `s-account`), avatar (photo or initials), name, email.
2. Stats: Books read, Following, Highlights. Books read = books the reader finished (all time). Following = authors and readers followed (flow 11 `follows`). Highlights = count of highlight annotations. All come from one call (`get_profile_summary`) and show real numbers; while loading they show a short skeleton, never zeros. Highlights taps to `s-my-highlights`.
3. Reading goal band: ring with "<read>/<target>", "Reading goal", "Books this year", and "<read> of <target> · <left> to go, <status>". Taps to `s-goal`. With no goal set the band reads "Set a reading goal" and opens `s-goal`.
4. Status wording: "on track" when books read this year ≥ floor(target × days elapsed ÷ days in year); otherwise "N behind" where N = that number minus read; "Goal reached" when read ≥ target (the ring is full and extra books keep counting). The year uses Africa/Lagos time.
5. My collection: My bookmarks, My highlights, My notes with counts; each opens `s-my-highlights` on that tab.
6. Author section: "Become an Arpedia author" opens the author application (flow 8, file 11). For readers who are already authors it reads "Author Studio" and opens Studio. Nothing else on this screen (the Profile page is the only place icons are allowed in rows, per README).

**Reading goal (`s-goal`)**
7. Options 6, 12, 24, 52 plus a number field ("Or enter your own number", digits only, 1 to 365). The current goal is pre-selected so Set goal is enabled; with no goal, the button is disabled until a value is chosen.
8. Pace hint under the options: "<N> books is about <N ÷ 12 rounded, 'a month' wording> a month. You've read <read> so far." For N below 12: "about 1 every <12 ÷ N rounded> months".
9. Set goal saves for the current year and closes. Only finished books with a finish date in the year count. Changing the goal never changes the count. Goals do not roll into next year; on the first open after 1 January the band reads "Set your goal for <year>" and last year's result is kept in history.

**My highlights (`s-my-highlights`)**
10. Header: "My highlights" with "<n> highlights across <m> books" (the counts follow the selected tab). Tabs: Bookmarks, Highlights, Notes, each with a count. Items are grouped by book (title, author, "N highlights · N notes"); groups ordered by most recent item first.
11. An item shows chapter and date ("Ch. 7 · 10 Nov"; add the year if not this year), the highlighted text (with its colour and a non-colour marker for the colour name), the reader's note if any, and "shared to <club>" if shared. Tapping opens the reader at that exact place (CFI, flow 4).
12. The header action button (third icon) opens search within this list by text (default). Long press or swipe on an item offers Delete (bookmark, highlight or note), with an Undo toast for 5 seconds. Deleting is a soft delete; the row is removed from sync after Undo expires.
13. Works offline from the synced local copy; deleting offline syncs later. A book that was removed from the library still shows its highlights; tapping it asks the reader to unlock or re-open the book.

**Settings (`s-account`)**
14. Top card: avatar, name, email, Edit (opens `s-edit-profile`). Rows in this order, grouped. **Account:** Edit profile; Notifications (subtitle "Replies, authors, reminders", opens `s-notif-prefs`); Security (subtitle "Password, devices"); Privacy (subtitle "Blocked people · N", opens blocked people, flow 12 `s-blocked`). **Reading:** Preferences (genres picked, "N selected", opens `s-interests` in settings mode from flow 1); Navigation ("Swipe pages", opens reader settings, flow 4). **Default reader theme:** Light, Sepia, Dark. **Storage:** Downloads ("N books · size · Wi-Fi only", opens offline library, flow 7). **Payments:** Credits (balance, opens flow 6), Subscription (status, opens plans). **App:** App colour (current name, opens `s-theme-settings`); Invite friends; About Arpedia (version); Help and support (support@arpedia.africa). Then Log out, and Delete account as a quiet red text link.
15. Default reader theme saves `profiles.reader_theme` and applies to the next book opened; it does not change the app colour.
16. Invite friends shows the share sheet with the reader's invite link. The row says "Share your link · you both get 50 credits" in the prototype; the reward is not built here (see Open questions).
17. Log out ends this device's session and removes tokens. Downloaded books stay on the phone but stop opening until the reader signs in again. It asks no confirmation unless a download or sync is in progress ("Sync not finished. Log out anyway?").

**App colour (`s-theme-settings`)**
18. Same four choices as onboarding. Choosing one recolours the whole app at once (tokens only) and Done closes. The choice is saved on the phone immediately and to `profiles.theme` when online; on a second device it applies at next launch.

**Notification preferences (`s-notif-prefs`)**
19. Toggles under "Send me": Club and room messages (subtitle "Mentions and replies only"), Authors you follow ("New books and posts"), Replies to your notes, Reading reminders ("A nudge if you haven't read in 3 days"), New arrivals and offers. Quiet hours: "Pause notifications" 22:00 to 06:00 (device time zone).
20. Defaults: club messages, authors, note replies and reading reminders on; new arrivals and offers off until the reader opts in (marketing consent); quiet hours off.
21. Toggles save on tap with no Save button; a failed save reverts the toggle with a toast. Preferences control which `notifications` rows are created and which pushes are sent. Quiet hours hold pushes until 06:00 and never hide items in the feed.
22. If the phone's notification permission is off, the screen shows a banner "Notifications are off on this phone" with "Open phone settings". Preferences still save.
23. The settings button on `s-notifications` opens this screen. Back returns to where the reader came from.

**Edit profile (`s-edit-profile`)**
24. Fields: Change photo, Full name (required, 1 to 80), Bio (optional, 160 characters, counter "30 / 160"), Phone number (+234 prefix, private), Date of birth (private), Country. Subtitle: "Only your name, photo and bio are public." Each private field has its own note.
25. Validation only after leaving a field (same rules as flow 1: phone 10 digits, real date, reader at least 13, country from list). Save changes is enabled only when something changed and all fields are valid. Saving shows "Profile saved" and returns to Settings.
26. Photo behaves as in flow 1 (crop, 512 px WebP under 200 KB, signed upload). Remove photo is offered when one exists.
27. Leaving with unsaved changes asks "Discard changes?".
28. Changing the name updates it on existing posts and messages (names are read from `profiles`, not copied). Name changes are limited to 3 per 30 days (default).

**Security (`s-security`)**
29. Sign-in: Email (with Verified or "Not verified" and a "Send verification email" action), Google (Connected or "Connect"), Change password. Change password asks for the current password then a new one (same rule and eye as flow 1), signs out all other devices on success, and is hidden for readers who only use Google (they see "You sign in with Google").
30. Devices: header "Devices · N of 3". Each row: device model, "This phone · <city>" or "Last used <date> · <city>", and Remove (not on this phone). Remove ends that session (within 1 minute), revokes its offline licence so downloaded books stop opening there, and frees a slot. Confirmation text names the device.
31. A reader can have many signed-in sessions but only 3 devices with downloads enabled. Signing in on a fourth device works for reading online; downloads on it show "Remove a device to download here" linking to this screen. Removing the oldest from this list is the only way to free a slot (no auto-eviction).
32. Footer note: "Downloaded books work on up to 3 devices. Remove one to add another."

**About and help (`s-about`)**
33. Version and build, Help centre (opens the help site), Contact support (email shown, Copy button copies it and toasts "Copied"), Terms of Service, Privacy Policy (both open the current published policy version, flow 16), Report a copyright issue (opens the copyright form from flow 14). One support address everywhere: support@arpedia.africa.

**Delete account (`s-delete-account`)**
34. The screen states plainly: the credits (with the live number), finished books, highlights and all messages will be deleted; any store subscription keeps billing until cancelled in Google Play (shown only if a store subscription is active, with a "Open Google Play subscriptions" link); web subscriptions are cancelled by the deletion.
35. "Delete my account" stays disabled until the reader types DELETE (exact, case-insensitive). "Keep my account" returns to Settings. Deleting with unspent credits has no refund (stated in the first line).
36. On confirm the server marks the account deleted, signs out every device, hides the profile and messages straight away, and a job erases personal data within 7 days (default). The reader sees a goodbye screen and is returned to Log in. It cannot be undone from the app.
37. What is erased: name, email, phone, birthday, photo, bio, interests, reading history, highlights, notes, library and unlocked books, direct messages, push tokens, devices. What is kept: payment and tax records for 6 years (without profile link where possible), reviews and discussion comments anonymised as "Former reader", reports the reader made with name removed, and the audit entry for the deletion. An author account with unpaid earnings is blocked from deleting until the next payout is complete (message: "You have earnings waiting. We'll delete your account after your next payout.").

## States and edge cases
- **Empty:** a new reader sees 0 Books read, 0 Following, 0 Highlights as real zeros, a "Set a reading goal" band, and My highlights shows per tab: "No bookmarks yet. Tap the bookmark in the reader to save a page." (similar copy for highlights and notes).
- **Loading:** skeletons for the stats row and the band; Settings rows render at once from cached profile.
- **Error:** a failed load shows a retry line in place of the block. A failed save keeps the form and shows the reason under the field or button. Delete failing keeps the account and says "Couldn't delete your account. Try again or contact support."
- **Offline:** Profile and My highlights work from cache. Editing profile, changing password, removing a device and deleting the account are disabled with "Connect to the internet to do this". Toggles in Notification preferences queue and sync.
- **Edge cases:** a reader whose goal is above 365 is rejected. A finished book later un-finished lowers the count. Two phones changing colour at once: last write wins. A deleted-account reader signing in again gets "This account was deleted" and can sign up again with the same email only after erasure finishes. Large text: Settings rows grow, subtitles wrap, nothing truncates silently.

## Data
| Table | Columns and notes |
|---|---|
| `profiles` (extend flow 1) | `bio` text (160), `reader_theme` enum (light, sepia, dark) default light, `name_changed_at` int[] or `name_change_log`, `deletion_requested_at`, `erased_at` |
| `reading_goals` | `user_id`, `year` int, `target_books` int (1 to 365), `updated_at`. Primary key (user_id, year) |
| `reading_progress` (core) | needs `finished_at` timestamptz null; set by flow 4 when a book reaches the end |
| `annotations` (core) | needs `kind` (bookmark, highlight, note), `colour`, `text`, `note`, `cfi_range`, `chapter_id`, `shared_group_id` null, `deleted_at` null |
| `notification_preferences` | `user_id` pk, `clubs` bool, `authors` bool, `note_replies` bool, `reminders` bool, `offers` bool, `quiet_enabled` bool, `quiet_start` time default 22:00, `quiet_end` time default 06:00, `timezone` text, `updated_at` |
| `user_devices` (from flow 1) | adds `revoked_at`, `revoked_by` (self or staff) |
| `account_deletions` | `id`, `user_id`, `requested_at`, `requested_via` (app, staff), `grace_until` null, `status` (pending, erasing, done, blocked), `blocked_reason`, `completed_at` |
| `staff_notes` | `id`, `user_id`, `author_id`, `body`, `created_at` (admin only) |
| `consent_log` | `user_id`, `kind` (marketing, terms, privacy), `granted` bool, `at` |

**RLS in plain words**
- `reading_goals`, `notification_preferences`: owner reads and writes own row. `annotations`: owner reads and writes own; shared highlights follow flow 12. `user_devices`: owner reads; owner can set `revoked_at` only through `remove_device`. `account_deletions`: owner can insert via RPC only; staff with the Delete accounts permission read and update status.
- `staff_notes`, `account_deletions` (other users' rows): staff only. Staff see reader phone numbers masked; revealing a full phone needs Super admin or Support and writes an audit entry.

**Migration notes from v25:** import goals (current year only), notification settings (map to the five toggles; set offers off unless v25 had explicit consent), bookmarks, highlights and notes with CFI ranges (flow 4 migration), and device lists (reset to empty; devices re-register on first sign-in).

## Server
| Function | Input | Output | Checks |
|---|---|---|---|
| `get_profile_summary()` | none | counts, goal, read-this-year, status text inputs, collection counts | Owner |
| `set_reading_goal(year, target)` | ints | row | Owner; 1 to 365; year is current or next |
| `list_collection(kind, cursor, query)` | kind, paging, optional text | items grouped by book | Owner; excludes `deleted_at` |
| `delete_annotation(id)` / `restore_annotation(id)` | id | none | Owner; restore only within 5 minutes |
| `update_profile(fields)` | name, bio, phone, dob, country, avatar_url | row | Owner; same validation as flow 1; name change limit |
| `set_notification_preferences(patch)` | partial fields | row | Owner |
| `change_password(current, new)` | strings | none | Re-authenticates; ends other sessions |
| `remove_device(device_id)` | id | none | Owner; not the current device; revokes session and offline licence |
| `request_account_deletion(confirm_text)` | "DELETE" | deletion row | Owner; blocks if author with unpaid earnings; signs out all devices |
| `erase_account` (queue worker) | deletion id | none | Erases per rule 37; keeps financial rows; anonymises comments; idempotent; audited |
| `staff_get_reader(user_id)` | id | profile, plan, credits, devices, counts (masked) | Permission View readers; audited when contact is revealed |
| `staff_set_reader_role(user_id, role)` | id, role | row | Super admin; audited |
| `staff_sign_out_device(user_id, device_id)` / `staff_sign_out_all(user_id)` | ids | none | Support, Operations admin, Super admin; ends sessions within 1 minute; audited |
| `staff_send_password_reset(user_id)` | id | none | Support, Operations admin, Super admin |
| `staff_start_deletion(user_id, mode, reason)` | `mode` = now or after_30_days | deletion row | Super admin or Support; typed confirmation; audited |
| `export_reader_data(user_id)` / reader self-export | id | file link | Reader for self (Settings, default under Privacy request); staff Super admin only with reason; link expires in 24 hours |

Push token cleanup: removing a device or deleting an account deletes its `push_token`.

## Admin side
| Screen | Prototype id | What staff do |
|---|---|---|
| Readers | `s-users` | Search by name, email, phone or user id; tabs All, Subscribers, Lapsed, No plan, Suspended, Deleted with counts; one Filters button (plan, platform, country or state, join date, role) with active filters as chips; table with plan, credits, last active, joined, Flags (open reports, privacy requests); paged. Phones masked |
| Reader: Overview | `s-user` | One subscription block (plan, store, price, period, store order id), one credits block, unlocked books, slim profile; folded notes, tickets, consent, recent activity. Header menu: Send password reset, Sign out all devices, Export data, Change role, Delete account. Primary action Grant credits, secondary Suspend |
| Reader: Reading and devices | `s-user-activity` | Currently reading, 30-day reading time (active minutes only), devices and sessions with Sign out per device, folded sign-in history (failed attempts flagged), library and notes counts |
| Delete reader account | `s-user-delete` | Lists what is deleted and kept, warns about active store subscriptions, offers Delete after 30 days (account hidden and signed out now, reader may sign in within 30 days to restore) or Delete now (typed confirmation, only when the reader asked in writing) |

Not built here, built by their own flows using this page's header and tabs: Credits tab, Grant or remove credits, Return a chapter charge (flow 6, file 09: grants up to 500 apply at once, over 500 need a second approver); Safety tab and Sanction a reader (flow 14). Staff cannot cancel Google Play or App Store subscriptions. Staff never see private message content.

Access: Support, Operations admin, Super admin act on readers; Moderator views and sanctions; Finance sees plan and payments only; Analyst has no reader pages. Every action and every reveal of personal details is audited.

## Analytics
`profile_viewed`, `goal_set` (target, previous), `collection_opened` (tab), `collection_item_opened` (kind), `annotation_deleted` (kind), `settings_row_tapped` (row), `theme_changed` (theme, source), `notif_pref_changed` (key, value), `profile_saved` (fields changed, not values), `password_changed`, `device_removed`, `delete_account_started`, `delete_account_confirmed`, `delete_account_cancelled`, `invite_shared`. No personal values.

## Done when
- [ ] On a real phone, Profile shows real counts for a seeded reader and the goal ring matches the status text (on track, behind, reached) on three test dates.
- [ ] Setting a goal, changing colour and toggling a notification survive an app restart and show on a second device.
- [ ] My highlights opens the exact page from an item, deletes with Undo, and works offline.
- [ ] Removing a device in Security signs it out within a minute and its downloaded books stop opening; a fourth device cannot enable downloads.
- [ ] Change password ends other sessions. Edit profile validation fires only after a field is left.
- [ ] Deleting an account (with a staging reader) signs out all devices, hides the profile at once, erases personal data within the job window, keeps payment records, and anonymises the comments as "Former reader".
- [ ] In the admin, Support finds a reader by email, sees masked phone, signs out a device and sends a reset; each action is in the audit log.
- [ ] pgTAP: RLS on `reading_goals`, `notification_preferences`, `annotations`, `account_deletions`, `staff_notes`; `request_account_deletion` blocks unpaid-earnings authors and requires exact text; `remove_device` cannot remove the current device; erase keeps ledger and payment rows and anonymises comments; staff reader RPCs reject wrong roles.
- [ ] Vitest: goal status (on track, behind, reached) including leap year and 1 January; pace hint wording; date label ("10 Nov", with year when not this year); quiet-hours window across midnight; name-change limit; DELETE confirmation matching.
- [ ] Maestro: log in, open Profile, set a goal of 24, open Settings, change app colour to Palm, toggle one notification, log out.

## Not in this flow
Blocked people list (flow 12); reader settings screen (flow 4); Credits, plans, refunds (flow 6); author application and Studio (flow 8); notification feed (flow 2); push campaigns (flow 15); referral rewards; two-step for readers; account export UI beyond the Privacy request (see Open questions).

## Open questions
1. Invite friends promises "you both get 50 credits". No screen, rules or cost model exist. Default: share link only until a referral spec is approved.
2. Account deletion timing: the app says "can't be undone" while the admin offers a 30-day grace. Default: app deletion is immediate (data erased within 7 days); staff may choose grace. Confirm with legal (NDPA 30 days).
3. Reader self-export of data: the prototype has no app screen. Default: reader emails support or uses Settings → Privacy request; staff export as in rule list. Decide whether to add a self-serve button.
4. Authors with unpaid earnings cannot delete until the next payout (rule 37). Confirm.
5. Notification defaults, especially offers off, are a consent default; confirm with legal.
6. Minimum age 13 and max 3 name changes per 30 days are defaults.
7. Search within My highlights: the third header icon has no label in the prototype; default is text search.
8. Goal max 365 and yearly reset behaviour are defaults.
9. Whether the 3-device limit counts only download-enabled devices (default) or all signed-in devices.
10. Reading goal year uses Africa/Lagos; readers abroad get the same boundary.
11. Admin copy mismatches: `s-user` shows "Credits per period 900" for Quarterly (should be 800) and unlocked books as "readable while the subscription is active", which contradicts the README rule that unlocked books stay forever.
