# Flow 16 · Admin access and settings

**Build order:** 16 (a thin slice ships with flow 1; the rest at the end) · **Depends on:** flow 1 (auth, `profiles`) · **Prototype:** admin screens `s-signin`, `s-signin-2fa`, `s-signin-reset`, `s-no-access` (area 1); `s-team`, `s-team-invite`, `s-roles`, `s-audit`, `s-audit-entry`, `s-config`, `s-config-confirm`, `s-pricing-rules`, `s-pricing-rules-confirm`, `s-policies`, `s-integrations`, `s-account` (area 11)

## Goal
Staff can sign in safely, see only what their role allows, and run the platform's settings: team, roles, app configuration, pricing rules, policies, integration health and a permanent audit log. Every other flow's admin screens rely on the access rules defined here.

**Success looks like:** no staff request succeeds without a server-side role check and a matching audit entry; a pricing or maintenance change cannot be saved without a fresh two-step code.

## Build in two passes
- **Pass 1 (with flow 1):** `staff_members`, `staff_invites`, `role_permissions`, `audit_log`, `write_audit()`, staff sign-in, two-step, `is_staff()` / `has_permission()` helpers, `s-no-access`, Team and roles (list, invite, disable). Every flow's admin RPC uses these from day one.
- **Pass 2 (last):** `s-roles` matrix UI, `s-config`, `s-pricing-rules`, `s-policies`, `s-integrations`, `s-account` extras, `s-audit` filters and export.

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Sign in | `s-signin` | Email and password, or Google (@arpedia.africa only) |
| Two-step code | `s-signin-2fa` | 6-digit authenticator code, backup code, trust browser |
| Reset password | `s-signin-reset` | Email a one-time reset link |
| No permission | `s-no-access` | Shown for pasted links to pages the role cannot open |
| Team and roles | `s-team` | Staff list, status, two-step, last active; row menu |
| Invite staff | `s-team-invite` | Name, email, role, 72-hour link |
| Roles and permissions | `s-roles` | Read-only matrix, two-person rules, who has which role |
| Audit log | `s-audit` | Filterable, permanent list of staff actions |
| Audit entry | `s-audit-entry` | One action with before and after values |
| App configuration | `s-config`, `s-config-confirm` | Versions, force update, maintenance mode, feature flags, OTA, remote copy |
| Pricing rules | `s-pricing-rules`, `s-pricing-rules-confirm` | Book price, reading and paying, authors and plans, plan check |
| Policies and legal pages | `s-policies` | Versioned legal text, accept-again switch |
| Integrations health | `s-integrations` | Status per outside service, masked keys |
| My account | `s-account` | Own profile, two-step, sessions, alert preferences, password |

## Behaviour
**Sign in (`s-signin`, `s-signin-2fa`, `s-signin-reset`)**
1. There is no sign-up. A staff account exists only if a Super admin invited it. Sign-in for an email with no active `staff_members` row fails with the same message as a wrong password.
2. Email and password sign-in always continues to the two-step screen. A session below assurance level 2 (AAL2) can open nothing except the two-step screen and `s-account` setup.
3. Continue with Google works only for addresses ending `@arpedia.africa` that also match an active staff row. Google sign-in still goes through two-step.
4. Two-step is required on every sign-in from a new browser and again after 12 hours. "Trust this browser for 12 hours" keeps the session alive for 12 hours across browser restarts; unticked, the session ends when the browser closes. No session lasts longer than 12 hours.
5. A backup code works once in place of an app code. Using one shows "N of 10 left" in `s-account`.
6. **Step-up:** these actions need a fresh code even inside a session: save pricing rules, turn on maintenance mode, force update, OTA rollback, rotate a key, publish a policy version, release a payout, confirm a price change, export personal details. Each fresh code is single-use and valid for 5 minutes. Super admins and Finance must always have two-step on.
7. Reset password sends a link valid 30 minutes, usable once. The page says "If <email> has a staff account, a link is on its way" in every case. After reset, two-step is still required. Changing a password signs the person out of all other sessions.
8. Rate limits (default): 5 wrong passwords in 15 minutes locks that email for 15 minutes; 5 wrong codes locks code entry for 10 minutes. The message does not say which part was wrong.
9. Staff passwords need at least 12 characters.

**Access (`s-no-access`, sidebar)**
10. Roles: Super admin, Operations admin, Publisher, Moderator, Finance, Support, Analyst. One role per person.
11. The sidebar hides links the role cannot use. A pasted link to a forbidden page shows `s-no-access`, which names the page, the person's role and who can open it.
12. The browser is never trusted. Every admin RPC and every table policy checks `has_permission(permission)` against the live `staff_members` row, so a disabled account loses access on its next request.

**Team and roles (`s-team`, `s-team-invite`, `s-roles`)**
13. Only Super admins invite, change roles, reset two-step or disable staff. Each action writes an audit entry.
14. Invite: work email must end `@arpedia.africa`. The link works once and expires in 72 hours. The invited person sets a password and enrols an authenticator on first visit and can do nothing until both are done. Row status: Invited (with Resend), Active, Not set up, Disabled.
15. Disable account: signs the person out everywhere and blocks access immediately (see rule 12). History stays under their name. The account can be switched on again. Staff accounts are never deleted. Disable shows a toast with Undo.
16. There must always be at least 2 active Super admins. Disabling or demoting a Super admin is rejected if it would leave fewer than 2 while 2 or more exist. While only 1 exists, the matrix page shows "Only 1 Super admin, add a second".
17. Two-person rules cannot be switched off: payout release (Finance calculates, a Super admin releases), plan price change (Finance proposes, a Super admin confirms), credit grants over 500 (a second Super admin or Operations admin approves), personal-data export (Super admin, with a reason). Nobody approves their own request.
18. The permission matrix is read-only in the console. Changing it needs a code release so permissions are reviewed.

**Audit log (`s-audit`, `s-audit-entry`)**
19. Every staff write, every reveal of personal details and every export creates an audit entry in the same transaction as the action. If the entry cannot be written, the action fails.
20. Entries cannot be edited or deleted by anyone, including Super admins and the database owner role used by the app. Retention is 7 years. Staff who leave stay in the log by name.
21. List columns: when, staff, action, object, details, IP and place. Filters: staff member, area, action type, date range (default last 7 days), plus text search. Paged 10 to 50 per page.
22. An entry shows who, role, action key (for example `author_earnings.close_month`), object, before and after values, and under "More details" request id, IP, device and the time two-step was verified. Personal data inside before and after is masked unless the viewer holds the permission to see it.
23. Finance sees only money-area entries; Analyst and Operations admin see all; other roles cannot open the log.

**App configuration (`s-config`, `s-config-confirm`)**
24. Super admin only for force update, maintenance mode and flags. Operations admin may edit Remote copy and see the page read-only otherwise.
25. Minimum Android and iOS versions are text fields (`major.minor`). "Latest" fields are read-only, taken from the store. Turning on Force update shows how many readers it locks out (share of app opens in the last 7 days below the minimum) and confirms with a message.
26. Maintenance mode needs a fresh code and a message to readers. When on, the app shows the message on its next screen change and blocks reading and offline sync. Downloaded books stay readable. The staff console keeps working.
27. Feature flags are grouped Community, Money, App. Each has on/off, a rollout percentage (0 to 100, chosen per user by a stable hash of the user id) and an optional minimum app version. Turn off confirms with a message and Undo. Risky flags keep their one-line warning (for example "Off leaves unspent credits, nothing is refunded").
28. Over-the-air updates: shows current and previous bundle, publish time and share of phones reached. "Roll back to previous bundle" needs a fresh code and takes about 10 minutes to reach phones, which pick it up the next time the app opens.
29. Remote copy: 5 keys (`paywall.title`, `paywall.subtitle`, `paywall.yearly_badge`, `unlock.confirm`, `credits.empty`) the app loads at start-up. Placeholders like `{credits}` must be kept; saving a text that drops a required placeholder is rejected. The app falls back to bundled text if the load fails.
30. The app reads config at start, on returning to foreground and at most once a minute. Changes reach phones within about a minute.

**Pricing rules (`s-pricing-rules`, `s-pricing-rules-confirm`)**
31. One page holds every number from README "Money and credits": words per standard page (250), credits per page (0.5), full-page image counts as (1 page), free preview (10%), split chapters longer than (20 pages), undo window (10 minutes), pay as you read on/off, auto-unlock next chapter default, author rate (₦1.60 per credit), rollover cap (1 plan's worth), pause months (1 to 3). Credit value (₦3) is shown but locked (see Open questions).
32. The page shows a live example: 62,400 words gives 250 pages, 125 credits, ₦375 (price = ceil(pages × credits per page)).
33. **Plan check:** for each plan and for top-ups, net per credit = price × (1 − 0.15 Google Play fee) ÷ credits; margin = net − author rate. Saving is blocked if any margin is zero or below. The page also shows the margin with VAT withheld.
34. Review and save opens the confirm sheet: the rule changed, how many book prices move, average price before and after, biggest change, plan check result. It needs a fresh code.
35. Saved rules take effect at 00:00 WAT (Africa/Lagos) the next night, never mid-day. Until then Undo is available. Books already unlocked, chapters already paid and readers part-way through pay as you read keep the price they started with.
36. At the effective time a job recomputes the stored price of every live book revision from its stored page count. Each change is logged in the change log under More details.
37. Only a Super admin can save. A Finance role can view and export rules. Export rules downloads the current values as CSV.

**Policies (`s-policies`), Integrations (`s-integrations`), My account (`s-account`)**
38. Policies: Terms of service, Privacy policy, Community guidelines, Copyright policy, Author agreement, Refund policy, Delete-account page. A published version can never be edited; changes are made on a draft and published as a new version with the old one kept. Publishing needs a fresh code and a one or two sentence "what changed". If "Accept again" is on, readers (or authors) see a full-screen notice on next app open and must tap Accept to keep using the app. Public copies are at arpedia.africa/legal. The Delete-account page must always be live (Google Play).
39. Integrations: one row per service (Supabase, RevenueCat, Google Play, App Store Connect, Flutterwave checkout, Flutterwave transfers, Firebase Cloud Messaging, Cloudflare R2, expo-updates, Resend) with status (Working, Degraded, Failing), last event, error rate for 24 hours. Health checks run every minute. Only failing services are open by default. Keys and webhook addresses are masked, never shown in full. Rotating a key needs a fresh code, is audited, and the old key keeps working for 24 hours. Check all now runs the checks immediately.
40. My account: edit name and optional phone for urgent alerts; email and role read-only; two-step management (change authenticator, regenerate backup codes); active sessions with Sign out and Sign out of all others; alert preferences (high-severity reports, failed payouts, copyright claims, applications waiting too long, system health) delivered to the bell and by email for urgent ones. High-severity reports always alert and cannot be turned off.

## States and edge cases
- **Empty:** audit log with no match for filters shows "No actions match" and a Clear filters button; Team with no pending invites hides the Invited rows.
- **Loading:** table skeletons; confirm sheets show a spinner on the button and disable it to stop double saves.
- **Error:** failed save keeps the form and shows the reason inline; an expired step-up code says "Code expired, enter a new one". An expired or used invite or reset link shows a page with a Request new link action.
- **Offline:** the console needs a connection. Show a banner and disable every save.
- **Edge cases:** two Super admins saving pricing rules at once: the second save fails with "Rules changed by <name>, review again" (compare a version number). Disabling yourself is rejected. A Super admin being the last one cannot be demoted. Changing a role while the person is signed in takes effect on their next request. A staff member who is also a reader keeps one auth user; the console reads only `staff_members`.

## Data
| Table | Columns and notes |
|---|---|
| `staff_members` | `user_id` pk (auth user), `role` enum (7 roles), `status` enum (invited, active, disabled), `phone`, `mfa_enrolled_at`, `last_active_at`, `invited_by`, `disabled_at`, `disabled_by`. Authoritative for staff. A trigger keeps `profiles.is_staff` in step |
| `staff_invites` | `id`, `email`, `full_name`, `role`, `invited_by`, `token_hash`, `expires_at`, `accepted_at`, `revoked_at`. Plain tokens are never stored |
| `staff_backup_codes` | `user_id`, `code_hash`, `used_at` (10 per person) |
| `staff_stepups` | `user_id`, `scope`, `verified_at`, `consumed_at`. One row per fresh code |
| `role_permissions` | `role`, `permission` text, `level` enum (allow, limited), `limit_note`. Seeded by migration, read-only to every role |
| `approval_requests` | `id`, `kind` (payout_release, price_change, credit_grant, pii_export), `payload` jsonb, `requested_by`, `approver_id`, `status` (pending, approved, rejected, expired), `reason`, `created_at`, `decided_at`, `expires_at` (default 7 days). Check: approver differs from requester |
| `audit_log` | `id` bigserial, `at`, `actor_id`, `actor_name`, `actor_role`, `area`, `action` text, `object_type`, `object_id`, `object_label`, `summary`, `before` jsonb, `after` jsonb, `reason`, `request_id`, `ip` inet, `device`, `mfa_verified_at`, `retain_until` (at + 7 years). Partitioned by month |
| `app_config` | `key` pk, `value` jsonb, `updated_by`, `updated_at` (min versions, force update, maintenance flag and message) |
| `feature_flags` | `key` pk, `label`, `group` (community, money, app), `enabled`, `rollout_percent` int 0 to 100, `min_app_version`, `warning`, `updated_by`, `updated_at` |
| `remote_copy` | `key` pk, `text`, `required_placeholders` text[], `updated_by`, `updated_at` |
| `pricing_rules` | `id`, `version` int, `params` jsonb (all values in rule 31), `status` (draft, scheduled, active, superseded, cancelled), `effective_at`, `created_by`, `step_up_id`, `plan_check` jsonb, `created_at`. Exactly one active row; at most one scheduled |
| `policies`, `policy_versions` | `policies(slug, title, audience)`; `policy_versions(policy_id, version, body, change_summary, accept_again, status, published_at, published_by)`; a trigger blocks any update to a published version |
| `policy_acceptances` | `user_id`, `policy_version_id`, `accepted_at` |
| `integration_health` | `service` pk, `status`, `last_event_at`, `last_event_text`, `error_rate_24h`, `checked_at` |
| `staff_alert_prefs` | `user_id`, `kind`, `enabled` |

**RLS in plain words**
- `audit_log`: no insert, update or delete for any role from the client; inserts happen only through `write_audit()` (security definer). Select by rule 23. Triggers also reject update and delete for the owner role.
- `staff_members`, `staff_invites`, `staff_backup_codes`, `staff_stepups`: a person reads their own row; Super admin reads all `staff_members` and `staff_invites`; writes only through RPCs. Backup codes and step-ups are never readable by clients.
- `role_permissions`: readable by any active staff, writable by nobody.
- `app_config`, `feature_flags`, `remote_copy`: any reader may read the public subset through `get_app_config` only (no direct table access); writes by Super admin (copy also by Operations admin) through RPCs.
- `pricing_rules`: read by Super admin, Operations admin, Finance; writes only through `save_pricing_rules`.
- `policy_versions`: published rows are public read; drafts staff only.

**Migration notes from v25:** v25 had only `admin` and `editor` roles. Map every v25 `admin` to Super admin (then lower after review) and every `editor` to Publisher. Every migrated staff user must enrol two-step on first sign-in. Copy v25 Terms and Privacy text in as version 1 of each policy.

## Server
| Function | Input | Output | Checks |
|---|---|---|---|
| Custom access token hook | auth user | adds `staff_role`, `aal` claims | Reads live `staff_members`; no claim if not active |
| `is_staff()`, `has_permission(p)` | permission | boolean | Used inside every policy and RPC |
| `write_audit(area, action, object, before, after, reason)` | as listed | audit id | Called inside staff RPCs; takes IP, device and request id from request context |
| `invite_staff(email, name, role)` | strings | invite id | Super admin; `@arpedia.africa`; no active duplicate |
| `accept_invite(token, password)` Cloudflare Worker | token | session | Token valid, unused, unexpired; then forces TOTP enrolment |
| `change_staff_role`, `reset_staff_mfa`, `set_staff_status` | user, value | row | Super admin; at-least-2-Super-admins rule; cannot target self for disable |
| `verify_stepup(scope, code)` | scope, 6-digit code | step-up id | Valid TOTP or backup code; 5-minute life; single use |
| `request_approval`, `decide_approval` | kind, payload / id, decision | request row | Approver is a different person with the right role |
| `get_app_config()` Cloudflare Worker | app version, user id | versions, maintenance, flags for that user, remote copy | Public, cached 60 seconds, no secrets |
| `set_config`, `set_flag`, `set_copy` | key, value | row | Roles per rule 24; step-up where rule 6 says; audited |
| `preview_pricing_change(draft)` | params | counts, averages, biggest change, plan check | Super admin or Finance |
| `save_pricing_rules(draft, expected_version, stepup_id)` | params | scheduled row | Super admin; plan check passes; version matches; effective next 00:00 WAT |
| `apply_pricing_rules` (pg_cron, 00:00 WAT) | none | none | Promotes scheduled row, reprices live revisions, audits |
| `publish_policy(policy, summary, accept_again, stepup_id)` | as listed | version row | Super admin; creates immutable version |
| `check_integrations` (Cloudflare Worker on a cron trigger, every minute) | none | updates `integration_health` | Pings or reads provider status; writes no secrets |
| `rotate_integration_key(service, stepup_id)` | service | audit id | Super admin; old key valid 24 hours |

## Admin side
This flow is the admin side. Sidebar visibility comes from `role_permissions`. Preview as (Super admin only) shows another role's sidebar and Home for review, read-only and audited.

## Analytics
Staff events go to the audit log, not PostHog. Sentry on the admin app tags `staff_role`. PostHog (readers only): `maintenance_screen_shown`, `force_update_shown`, `policy_accept_shown`, `policy_accepted` with `policy`, `version`.

## Done when
- [ ] A staff user is invited, sets password and authenticator, signs in, and sees only their role's sidebar; a pasted forbidden link shows `s-no-access`.
- [ ] A disabled staff member's next request is refused in under a minute and they are signed out.
- [ ] The last two Super admins cannot be demoted or disabled.
- [ ] Saving pricing rules without a fresh code fails; with one it schedules for 00:00 WAT and Undo works before then; a plan with margin at or below zero cannot be saved.
- [ ] Maintenance mode on a staging phone shows the message on the next screen change and downloaded books still open.
- [ ] Every action above appears in the audit log with before and after, and no UI or API can edit or delete an entry.
- [ ] pgTAP: `audit_log` immutability and role visibility; `has_permission` per role against the seeded matrix; at-least-2-Super-admins rule; no self-approval in `approval_requests`; step-up single use and 5-minute expiry; `save_pricing_rules` role, version-conflict and plan-check rejection; `policy_versions` immutability.
- [ ] Vitest: plan check maths (including VAT case), price formula `ceil(pages × credits per page)`, next 00:00 WAT calculation across month ends, rollout bucket (same user always lands in the same bucket, share within 1% over 10,000 ids), app version comparison (`25.4` vs `25.10`).
- [ ] No Maestro test (admin is web). Real-browser check on staging in Chrome and Safari at 1280 and 400 px.

## Not in this flow
Editing the permission matrix in the console; per-user permission overrides; SSO beyond Google; staff alerts feed screen (`s-staff-alerts`) and Home task queues (flow 15 and each flow's queue); payout release screens (flow 13); plan prices and refunds (flow 6, file 09).

## Open questions
1. Who is the second person when pricing rules are saved? Prototype shows Super admin plus a code only, while the matrix marks Change prices with an asterisk. Default: code only for rules, two-person for plan prices.
2. Lock credit value at ₦3? Default: read-only, because Play products and top-up prices are fixed.
3. Changing the author rate: should it force a new Author agreement version and re-accept? Default: yes.
4. Launch with only one Super admin? Default: allowed until the second is added, with a warning on every Super admin's Home.
5. Feature flags in Supabase (`feature_flags`) or PostHog? Default: Supabase table for the flags on `s-config`; PostHog only for dark-launching unfinished flows.
6. Rotating a key in the console: record only, or write to the secrets store? Default: record and audit; the secret itself is changed in the provider and secrets manager by engineering.
7. Failed-sign-in lockout numbers (5 in 15 minutes, 10-minute code lock) and 12-character password minimum are defaults.
8. Backup code count 10 and step-up life 5 minutes are defaults.
9. Admin copy says "1 credit is worth about ₦5" on `s-user-grant` and "900 credits per period" on a Quarterly plan in `s-user`; both conflict with ₦3 and 800. Fix the prototype copy. **Resolved 16 Nov:** prototype, BRIEF.md and book-pipeline.md corrected.
