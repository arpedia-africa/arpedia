# Spec check: flows 00 to 16

Builder C, 23 Nov 2026. Read-only audit of `origin/main` (a4d80e2) and `origin/flow/17-journeys` against `docs/prd/00-*.md` to `16-*.md`.

Each row is a gap: a rule, state, server job, notification, email or analytics event the code does not really do end to end. Rules that are fine are left out. Severity: **blocks launch** / **should fix** / **later**. Who: **A** server or code, **B** app screens (emulator-testable), **owner** account, payment, legal or product decision.

## Totals

_In progress. Order: 04, 09, 13, 14, 12, 03, then 00 to 16._

## Launch blockers

_In progress._

## 00 · Foundation

| | Id | Rule | What is missing | Where | Severity | Who |
|---|---|---|---|---|---|---|
| - [ ] | 00-1 | Done when 7 (staging health) | Staging and production `SUPABASE_URL` are placeholder hosts (`arpedia-staging.supabase.co`, `arpedia.supabase.co`), not real project refs, so JWKS verification and the health route cannot answer on staging until real projects, R2 buckets and secrets exist. | `workers/api/wrangler.jsonc:30` (also `workers/chat/wrangler.jsonc:25`) | should fix | owner |
| - [ ] | 00-2 | 24 | No real branch protection on `main`: `main-guard.yml` only sends an ntfy alert after a direct push; nothing stops a merge with red gates. | `.github/workflows/main-guard.yml:1` | should fix | owner |
| - [ ] | 00-3 | 12 | The offline banner is only mounted in the tabs layout. Stack screens (reader, checkout, book, account, studio, rooms) show no offline banner. | `apps/mobile/app/(tabs)/_layout.tsx:30` (should also be in `apps/mobile/app/_layout.tsx`) | should fix | B |
| - [ ] | 00-4 | 11 | PostHog feature flags are never read: only `capture` is used and no flag hook or `isFeatureEnabled` call exists anywhere in the app. | `apps/mobile/src/lib/telemetry.tsx:15` | later | B |
| - [ ] | 00-5 | 23 / Done when 8 | The Maestro kit-gallery smoke test runs only nightly and on demand, not on pull requests. Draft PRs skip every gate. The file's own comment says this was deliberate, but the spec says PR. | `.github/workflows/ci.yml:107` | later | A |
| - [ ] | 00-6 | 13 | The command palette searches only console page names, but the top bar promises "Search readers, books, authors, payments". The empty state also admits records are not searchable. | `apps/admin/components/shell.tsx:133` | later | A |
| - [ ] | 00-7 | 13 | TanStack Table is a dependency but no admin file imports it. The tables do not use it for data and sorting logic. | `apps/admin/package.json:19` | later | A |
| - [ ] | 00-8 | 13 | The top-bar bell ("Staff alerts") is a plain link to `/account` and shows no alerts. | `apps/admin/components/shell.tsx:143` | later | A |
| - [ ] | 00-9 | 10 (iOS) | The iOS fastlane lanes exist (`match`, `gym`, `pilot`), but no workflow runs them. The Apple team, `APPLE_TEAM_ID`, the certificates repo and the App Store Connect key are not set up. | `apps/mobile/fastlane/Fastfile:144` (no iOS workflow in `.github/workflows`) | later | owner |

45 rules checked, 9 gaps.
## 14 · Trust, safety and support

| | Id | Rule | What is missing | Where | Severity | Who |
|---|---|---|---|---|---|---|
| - [ ] | 14-1 | Server: outbox / 7, 8, 19, 26, 36 | Nobody drains the `trust_notify` queue: `drainTrustOutbox` is only reachable by a manual POST and is not in the Worker cron list, so no staff alert, reporter notice, sanction notice, appeal outcome, claim notice, live hide/mute push or ticket-reply email is ever sent. | `workers/api/src/index.ts:42` | blocks launch | A |
| - [ ] | 14-2 | 7, 8, 19, 26, 36 | Even when drained, the handler only sends ticket-reply email; `reporter_notice`, `sanction_notice`, `appeal_decided`, `claim_author`, `claim_decided`, `staff_alert` are just acked and dropped ("delivered by flow 15" but flow 15 has no consumer for these kinds). Reader push on ticket reply also missing. | `workers/api/src/routes/14/trust.ts:256` | blocks launch | A |
| - [ ] | 14-3 | 17 Ban | `confirm_ban` and `admin_pending_bans` are never called by admin. A ban stays `pending` forever and never takes effect. | `apps/admin/app/(console)/reports/actions.ts:44` (no confirm action) | blocks launch | A |
| - [ ] | 14-4 | 1, 15, Done when 1 | `create_report` refuses review, discussion_comment, post_comment and author_post (`unsupported_content`); `_set_content_state` only handles messages, so Remove, auto-hide and Mark as spoiler do nothing for reviews, comments, posts. | `supabase/migrations/20261120001400_14_trust.sql:465` | blocks launch | A |
| - [ ] | 14-5 | 1 | App report entry points missing: only chat messages call `create_report`. Post comment and DM menus say "not on this branch yet"; no profile report; book and review use flow 03's `report_book`/`report_review`. | `apps/mobile/app/(authors)/post/[id].tsx:293`, `apps/mobile/app/(authors)/dm/[id].tsx:483` | blocks launch | B |
| - [ ] | 14-6 | 22 | Sanctions not checked in `add_comment`, `send_author_message`, `create_reading_room`, `post_review` (none reference `active_sanction`/`post_block_for`), so a muted user can still comment, DM authors, review and create rooms. | `supabase/migrations/20261120000800_08_authors.sql:507` (also `:701`, `20261119400000_07_rooms.sql:261`, `20261119000000_03_unlock.sql:835`) | blocks launch | A |
| - [ ] | 14-7 | 26 | No Appeal UI in the app: `create_appeal` and `get_my_moderation` are never called; sanctioned users see no decision message or Appeal button. Author book rejection just toasts "Write to authors@arpedia.africa". | `apps/mobile/app/(author)/studio/books.tsx:52` | blocks launch | B |
| - [ ] | 14-8 | 39, Done when 6 | Admin credit ledger "Return" (unlock-return overlay) calls flow 09 `staff_return_chapter`, not `staff_return_chapter_charge`: no 50-credit or 3-in-30-days Finance gate, no `credit_returns` row, and a charge can be returned twice through the two paths. | `apps/admin/app/(console)/credits/actions.ts:96`, `supabase/migrations/20261120000000_09_credits.sql:1136` | blocks launch | A |
| - [ ] | 14-9 | 31, 32 | `books.claim_hold_at` is written but never read: held books stay in Discover, author earnings are not frozen (nothing in flow 13), no `author_earnings` flag. | `supabase/migrations/20261120001400_14_trust.sql:1309` | blocks launch | A |
| - [ ] | 14-10 | 39, Done when 6 | `approve_credit_return` and `admin_list_credit_returns` have no admin screen, so returns waiting for Finance can never be approved. | `apps/admin/app/(console)/support/actions.ts:102` (no approve action) | should fix | A |
| - [ ] | 14-11 | 38 | `staff_grant_credits` has one tier (500 applies at once for any grant permission): no 200 Support limit, no 500 Operations tier, removal rule absent, "reader not told until approved" not handled. | `supabase/migrations/20261120000000_09_credits.sql:1085` | should fix | A |
| - [ ] | 14-12 | 36 | Ticket page Grant credits button is a toast: "Grant credits opens with Credits and plans (flow 09)." | `apps/admin/app/(console)/support/[id]/ticket-view.tsx:261` | should fix | A |
| - [ ] | 14-13 | Server: moderate-text / 23, 25 | `/v1/trust/moderate` has no caller: the chat Durable Object, `add_comment` and `post_review` never call it, so muted words, link rules, phone numbers from `automod_*` are never applied (chat only uses its own channel word list and hard-coded limits). | `workers/chat/src/conversation.ts:179` | should fix | A |
| - [ ] | 14-14 | 23 | Rate limits (messages/min, DMs/day), new-account restrictions (7 days rooms, review day 3) and spam detection (identical messages, cross-channel) are editable in `automod` but nothing reads them. | `supabase/migrations/20261120001400_14_trust.sql:52` | should fix | A |
| - [ ] | 14-15 | 33 | Book "Report this book" calls `report_book`, not `create_report`: copyright report creates no claim, skips daily limit, reporter-age eligibility and automod severity. | `apps/mobile/features/03/MoreSheet.tsx:112`, `supabase/migrations/20261119000700_03_reports.sql:45` | should fix | A |
| - [ ] | 14-16 | 3 | Reason lists not per content type: book sheet offers Wrong content / Copyright / Abuse (maps to other/copyright/harassment), not Copyright / Sexual content / Something else; review report is hard-coded `other`, no Spoilers. | `apps/mobile/features/03/MoreSheet.tsx:90`, `apps/mobile/app/book/[id]/reviews.tsx:121` | should fix | B |
| - [ ] | 14-17 | 2 | "Report a problem with this book" inserts a `book_content` report, not a support ticket in category Book access; `create_support_ticket` is never called by the app. | `supabase/migrations/20261119200000_04_reading.sql:738` | should fix | A |
| - [ ] | 14-18 | 34, Analytics: contact_support_opened | Contact support only copies the address (Share sheet); no mailto with app version, device model and user id prefilled. | `apps/mobile/app/(account)/about.tsx:20` | should fix | B |
| - [ ] | 14-19 | 41 | No in-app Help: `get_help_articles`, `get_help_article`, `vote_help` have no caller, no search, no Was this helpful vote, no offline cache of last 20 articles (Help centre just opens arpedia.africa/help). | `apps/mobile/app/(account)/about.tsx:18` | should fix | B |
| - [ ] | 14-20 | 22 | Suspended sign-in: no "Your account is suspended until 12 Dec. You can appeal from the email we sent." message and no appeal link for a suspended reader (sessions are deleted, GoTrue just refuses). | `apps/mobile/features/01` (absent) | should fix | B |
| - [ ] | 14-21 | 29, 30, 31 | Claims can only come from an app copyright report. No web form / email intake, similarity hint never computed (seed only), author cannot respond (`respond_to_claim` has no caller), `claim_author` notice never sent. | `supabase/migrations/20261120001400_14_trust.sql:1317` | should fix | A |
| - [ ] | 14-22 | 26, 28 | `create_appeal` rejects subject `application` (rejected applicant); overturning a `book_rejection` appeal changes nothing on the book revision. | `supabase/migrations/20261120001400_14_trust.sql:1099` | should fix | A |
| - [ ] | 14-23 | Edge: minors | No server check that banning a minor needs Super admin review; suspend hidden for minors only in the admin UI. | `supabase/migrations/20261120001400_14_trust.sql:846` | later | A |
| - [ ] | 14-24 | 4 | `set_report_severity` is never called; staff cannot change severity. | `apps/admin/app/(console)/reports/actions.ts` (absent) | later | A |
| - [ ] | 14-25 | Server: sla_watch / 37 | `sla_watch` only alerts High reports; it does not mark late tickets or alert. `reader_reply_ticket` throws `ticket_closed` after 7 days instead of opening a linked ticket, and has no app caller. | `supabase/migrations/20261120001400_14_trust.sql:1980`, `:1453` | later | A |
| - [ ] | 14-26 | Server: image moderation | No Worker checks profile photos or author images on upload. | `workers/api/src/routes/01/avatars.ts` (no check) | later | owner |
| - [ ] | 14-27 | Server: Resend | Reply email and inbound webhook need `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and domain setup; without a key replies are only `console.log`ged. | `workers/api/src/routes/14/trust.ts:227` | later | owner |
| - [ ] | 14-28 | Live enforcement | Admin only pushes to the reported message's group; `refresh_user` live items (mute/ban/overturn across other chats) have no consumer, so other sockets rely on the 60 s cache. | `apps/admin/app/(console)/reports/actions.ts:26` | later | A |
| - [ ] | 14-29 | Analytics | None of the 15 events (`report_started`, `report_sent`, `report_auto_hidden`, `report_decided`, `appeal_*`, `claim_*`, `ticket_*`, `credit_returned`, `help_*`, `contact_support_opened`) is fired anywhere in app, Workers or RPCs. | `apps/mobile/features/14/report.ts:55` | later | A |

78 rules checked, 29 gaps.
