# Flow 1 · Sign-in and onboarding

**Build order:** 1 · **Depends on:** none (calls flow 6 / file 09 for checkout; thin slice of flow 16 for staff sign-in) · **Prototype:** app screens `s-login`, `s-signup`, `s-interests`, `s-theme`, `s-role`, `s-profile-setup`, `s-plans-onboard`, `s-plans-all`, `s-all-set`; admin screens `s-signin`, `s-signin-2fa`, `s-signin-reset`, `s-no-access` (specified in [16-admin-settings.md](16-admin-settings.md))

## Goal
A new reader can create an account (email or Google), pick genres and an app colour, finish a short profile, see an honest plan offer, and land on Home with credits. A returning reader can log in and reset a password. Everything after sign-up except the account itself is skippable.

**Success looks like:** 70% of new sign-ups reach Home in under 2 minutes; at least 25% of finished onboardings start a plan or take the free route knowingly (tracked, not forced).

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| Log in | `s-login` | Email and password, Google, forgot password |
| Create account | `s-signup` | Name, email, password, Google |
| Choose genres | `s-interests` | Step 1 of 3, 10 genres, Skip |
| Pick your colour | `s-theme` | Sunflower, Palm, Plum, Night |
| Reader or author | `s-role` | Step 2 of 3 |
| Complete your profile | `s-profile-setup` | Step 3 of 3: photo, name, phone, birthday, country |
| Subscribe | `s-plans-onboard` | Personal paywall, two plans, how it works |
| All plans | `s-plans-all` | Sheet with Monthly, Quarterly, Yearly |
| You're all set | `s-all-set` | Credits added, renewal date, three first steps |

Order: signup → interests → theme → role → profile-setup → plans-onboard → (checkout, flow 6) → all-set → Home. Log in goes straight to Home (or to the first unfinished onboarding step).

## Behaviour
**Create account (`s-signup`)**
1. Fields in order: Full name, Email, Password. Buttons: Create account, Sign up with Google, "Log in" link. Under the button: "By creating an account you agree to the Terms and Privacy Policy" with both as links. The app stores the version of each policy accepted (`terms_version`, `privacy_version`) and the time.
2. The password rule "Use at least 6 characters." is visible under the field before typing. The eye toggles show or hide on every platform.
3. Validation runs when the person leaves a field and again on submit. Name required (1 to 80 characters). Email must look valid. Password 6 or more characters. Errors show under the field in red text, never as a popup.
4. An email already registered shows under the field: "This email already has an account. Log in?" with the link. (Default: this reveals account existence; accepted trade-off for a consumer app. Rate limits apply.)
5. On success the user is signed in, a verification email is sent in the background, and the app moves to `s-interests`. Verification does not block anything in this flow.
6. Sign up with Google uses the device's Google account picker and Supabase `signInWithIdToken`. Name and avatar come from Google. If the Google email already has an email account, the accounts are linked (same user). A cancelled picker returns to the form with no message.

**Log in (`s-login`)**
7. Fields: Email, Password with eye. Links: Forgot password?, Create an account. Buttons: Log in, Continue with Google.
8. A wrong email or password shows under the password field: "That email and password don't match." Same text for unknown emails.
9. Rate limit (default): after 5 failures in 15 minutes for one email, show "Too many tries. Try again in 15 minutes or reset your password."
10. On success the app registers the device (rule 31) and opens Home, unless onboarding is unfinished (rule 29).
11. Forgot password: the prototype has no screen. Default: tapping it opens a small sheet with Email and "Send reset link"; always replies "If that email has an account, a link is on its way." The link (valid 60 minutes, one use) opens the app and shows New password with the same rule and eye. After success all other sessions end.
12. Log in with Google works for Google-created and linked accounts; for an email-only account with no link it asks the reader to log in with their password once to link.

**Choose genres (`s-interests`)**
13. Shows the visible genres from `genres` (10 at launch). Multi-select. "Fiction" and "Nigerian books" are picked at first view. Picked chips fill with the main colour and a tick. The step band shows 1 of 3. Back returns to `s-signup` only if the account was just created in this session; otherwise it is hidden.
14. Continue saves picks to `user_genres` and moves on. Skip moves on and saves nothing (the two defaults are not saved). Picks drive Recommended for you on Home (flow 2). The same screen is reused from Settings → Preferences (flow 10) with a Save button and a back arrow.
15. At least 0 and at most all genres. Picking nothing and tapping Continue behaves like Skip.

**Pick your colour (`s-theme`)**
16. Four options, each a rounded square with its name, feel line and two dots (accent and star gold): Sunflower, Palm, Plum, Night. Sunflower is selected first. Choosing one recolours the screen immediately (tokens only, see DESIGN.md).
17. Continue saves `profiles.theme`. Skip keeps Sunflower. The choice is stored on the device first so it applies even offline, and synced when online.

**Reader or author (`s-role`)**
18. Two cards: "I'm a reader", "I'm an author". One must be picked; Continue is disabled until then (default pre-selection: none). Step 2 of 3.
19. The choice is saved as `profiles.signup_intent`. It does not grant the author role: authors apply from Profile (flow 8 file 11). It only affects the order of first-step cards on `s-all-set` (see Open questions).

**Complete your profile (`s-profile-setup`)**
20. Fields: photo (Add photo), Full name (filled from sign-up or Google), Phone number (+234 prefix), Date of birth (DD / MM / YYYY), Country (default Nigeria). Helper lines: phone "For account recovery only. Never shown to others."; birthday "Helps us suggest age-appropriate books." The header says only the reader sees this and it is optional.
21. Continue is enabled as soon as the name is present. Skip for now is always available. Validation only after leaving a field. Phone: 10 digits after +234, leading 0 removed. Date: a real date, reader at least 13 years old (default). Country from a list.
22. Add photo offers camera or gallery, square crop, resized on the phone to 512 × 512 WebP under 200 KB, uploaded through a signed upload URL. Failure leaves the initials avatar and shows "Photo didn't upload. Try again."
23. Phone and birthday are private; only name and photo are shown to other readers.

**Subscribe (`s-plans-onboard`, `s-plans-all`)**
24. Headline: "<first name>, your shelf is ready". Sub line: "<N> books in <up to three picked genres>. Start reading tonight." N comes from the live catalogue count for those genres. If no genres were picked, use "Your shelf is ready" and the total catalogue count. Three covers come from those genres (most read first).
25. Social proof shows a rating and one reader quote. Both must be real figures from store ratings and a stored quote (see Open questions); until real data exists the whole block is hidden.
26. Two plan cards: Quarterly (default, "Most popular") and Yearly ("Best value"), with price per month large, billing line, credits and "about N books". "See monthly plan" opens `s-plans-all` with Monthly, Quarterly, Yearly. Prices, credits and labels come from `plans` and the store product (Play price, in naira). Monthly ₦900 = 300 credits, Quarterly ₦2,400 = 800, Yearly ₦8,400 = 3,000. "Per month" labels: ₦900, ₦800, ₦700.
27. How it works timeline: Today (credits land, unlock all or pay as you read, first 10% free), Every renewal (credits refill, unused roll over one period), the reminder day (date = renewal date minus 3 days, as "Day N"), Anytime (pause or cancel in two taps, unlocked books stay). Text must match README rules; if pricing rules change, copy comes from remote copy and the plan row.
28. Primary button: "Continue · ₦<price>" opens `s-checkout` (flow 6). Under it: "Billed by Google Play every <period> until you cancel." with Terms and Privacy links. The close (✕, "Browse first") goes to Home with no plan; Restore runs "restore purchases" through RevenueCat and, if a plan is found, goes to `s-all-set`. If the reader taps back after a successful purchase they land on `s-all-set`, not the paywall.

**Resume, all set, first run**
29. `profiles.onboarding_step` (signup, interests, theme, role, profile, plans, done) is saved at each step. On next launch an unfinished reader resumes at that step; once `done` it is never shown again. Closing the app on the paywall counts as done.
30. `s-all-set` shows "<N> credits added" and "<Plan> · renews <date>", read from the subscription and ledger (never typed in). Three first-step cards: read the current top book (with its credit price), join the most popular club, follow a top author. Go to Home sets `onboarding_step = done`. A reader with no plan (came via ✕) never sees this screen.
31. On every sign-in the app registers the device in `user_devices` (model, OS, app version, push token when allowed). The first sign-in sets `download_enabled = true` while the reader has fewer than 3 enabled devices.
32. The system notification permission (Android 13+) is requested once when the reader taps Go to Home (default). If denied, nothing blocks; Notifications settings later shows a banner (flow 10).

## States and edge cases
- **Empty:** no genres chosen means a generic For you rail. No catalogue yet (first deploy) shows the paywall without covers.
- **Loading:** buttons show a spinner and are disabled while a request runs; paywall shows skeleton price cards until store prices load; never show a price before it loads.
- **Error:** network error on submit keeps the form and shows "No connection. Check your network and try again." under the button. Store billing unavailable on the paywall shows "Google Play isn't available right now" and disables Continue. Google sign-in errors show a retry message.
- **Offline:** Log in and Sign up need a network. Genres, colour, role and profile can be completed offline and are saved locally, then synced at the next connection. The paywall needs the store and is skipped if offline with a "Continue offline" path to Home.
- **Edge cases:** a returning reader with a Play subscription on a new phone: Restore finds it. Account created on the web (flow 6, Flutterwave) logs in on the phone with an active plan and skips the paywall. Two taps on Create account create one account. The OS back button on the first onboarding step asks to leave the app, not to undo the account. Large text: all forms scroll, buttons stay 44 px.

## Data
Extends core `profiles`; adds the rest.
| Table | Columns and notes |
|---|---|
| `profiles` (extend) | `full_name` text, `avatar_url` text, `phone` text null, `date_of_birth` date null, `country` text default 'NG', `theme` enum (sunflower, palm, plum, night) default sunflower, `signup_intent` enum (reader, author) null, `onboarding_step` text default 'signup', `terms_version` int, `privacy_version` int, `terms_accepted_at`, `created_at`, `deleted_at` null. Created by a trigger on `auth.users` insert. `username` is generated (name plus 4 digits) and not editable in this flow |
| `genres` | `id`, `name`, `slug`, `position` int, `visible` bool default true, `merged_into` null. Seeded; edited by staff in flow 2 |
| `user_genres` | `user_id`, `genre_id`, `created_at`. Primary key (user_id, genre_id) |
| `user_devices` | `id`, `user_id`, `device_key` (random, stored in secure storage), `model`, `os`, `app_version`, `push_token` null, `download_enabled` bool, `last_seen_at`, `last_city` null, `revoked_at` null. Unique (user_id, device_key) |

**RLS in plain words**
- `profiles`: a user reads and updates their own row except `role flags`, `deleted_at`, `terms_*` and `signup_intent` after onboarding, which only RPCs set. Other readers see only name, avatar, bio and counts through a view (`public_profiles`), never phone or birthday.
- `genres`: read by everyone, write by staff RPCs. `user_genres` and `user_devices`: owner only. Staff read devices through a Support-role RPC (flow 10).
- Avatar objects are written only through signed upload URLs scoped to `avatars/<user_id>/`.

**Migration notes from v25:** one-off migration into the new Supabase project (London): import auth users with their v25 password hashes so readers keep their logins (email, name, phone, DOB, country, avatar, v25 genre picks mapped to the new `genres`). Google sign-in re-links by email: the first Google sign-in with a matching verified email attaches to the migrated user. If a hash format is not supported by Supabase Auth, that user gets the forced "Forgot password" path with a clear message on `s-login`. Mark `onboarding_step = done` for all migrated users and keep their v25 plan until the store subscription is re-linked (flow 6).

## Server
| Function | Input | Output | Who and checks |
|---|---|---|---|
| Supabase Auth (email, Google) | credentials | session | Password min 6; email confirmation mail sent, not required; Google via ID token; auth rate limits as in rule 9 |
| `handle_new_user` (trigger) | auth user | `profiles` row | Copies name and avatar from metadata; sets terms versions from the signup payload |
| `save_onboarding_step(step, payload)` | step name, fields for that step | updated profile | Owner. Validates with zod-matching SQL checks (name length, phone shape, age at least 13, country code). Steps only move forward except `done` |
| `set_user_genres(genre_ids[])` | ids | none | Owner. Replaces the set in one transaction; ids must be visible genres |
| `get_onboarding_paywall()` | none | first name, picked genres, catalogue count, 3 covers, plans with store product ids | Owner. Plans from `plans` (flow 6) |
| `register_device(device_key, model, os, app_version, push_token)` | as listed | `download_enabled` | Owner. Upsert; enables downloads only if fewer than 3 active enabled devices |
| `create_avatar_upload()` Cloudflare Worker | content type | signed upload URL, final URL | Owner. Image types only, 2 MB limit |
| Supabase `resetPasswordForEmail` | email | none | Same reply for every email; link life 60 minutes |

Purchases and credit grants are not here: RevenueCat webhook and `grant_plan_credits` live in flow 6. `s-all-set` only reads the result. If the webhook is late (up to about 1 minute), show "Setting up your credits" with a spinner and poll the subscription row every 3 seconds; after 30 seconds show a "Refresh" button.

## Admin side
Staff sign-in (`s-signin`, `s-signin-2fa`, `s-signin-reset`, `s-no-access`), roles and the audit log are in [16-admin-settings.md](16-admin-settings.md). This flow ships its pass 1: invite, sign-in, two-step, role check. No reader-facing admin screens here (readers are managed in flow 10).

## Analytics
`signup_started`, `signup_completed` (method: email or google), `login_succeeded`, `login_failed` (reason, no email), `onboarding_step_viewed` (step), `onboarding_step_skipped` (step), `genres_selected` (count), `theme_selected` (theme), `role_selected` (intent), `profile_completed` (fields filled, not values), `paywall_viewed` (plan shown, genres_count), `plan_selected` (plan), `paywall_closed` (via browse_first), `restore_tapped` (result), `onboarding_completed` (seconds since signup_started). Never send email, phone or birthday.

## Done when
- [ ] On a real Android phone, a new reader signs up with email, picks genres and colour, skips the profile, closes the paywall, and reaches Home; closing the app mid-onboarding and reopening resumes at the saved step.
- [ ] Google sign-up and log in work on the staging build; linking an existing email account works.
- [ ] Wrong password, existing email, short password and offline each show their message under the right field or button; no popups.
- [ ] A staging sandbox purchase from the paywall reaches `s-all-set` showing real credits and renewal date; Restore finds an existing sandbox subscription.
- [ ] Forgot password email arrives, the link opens the app, and the new password works.
- [ ] All four themes pass AA on onboarding screens; large text at 200% keeps every button visible.
- [ ] pgTAP: RLS on `profiles` (cannot change role flags, cannot read another user's phone or birthday), `user_genres`, `user_devices`; `register_device` enables downloads only up to 3 devices; `save_onboarding_step` cannot go backwards.
- [ ] Vitest: phone normalisation, age check, `onboarding_step` ordering, paywall price-per-month label maths (₦900, ₦800, ₦700), renewal-reminder date (renewal minus 3 days).
- [ ] Maestro: sign up with email, pick genres, pick a colour, choose reader, skip the profile, tap ✕ on the paywall, land on Home.

## Not in this flow
Phone-number or OTP sign-in; Apple sign-in (required on iOS by App Store rule 4.8 because Google sign-in is offered; added when the iOS build starts); referral rewards; the checkout screen and credit granting (flow 6); the 3-days-before-renewal reminder job (flow 6 schedules it, flow 15 delivers it); author application (flow 8, file 11).

## Open questions
1. Minimum password length: prototype says 6; default kept, but 8 is safer. Decide before launch.
2. Email verification: default is non-blocking (sent, not required). Should unverified emails be blocked from buying or from password reset?
3. Minimum age: default 13. Nigeria's NDPA treats under 18 as children and may need parental consent. Needs legal answer, and affects the birthday rule.
4. Social proof on the paywall (4.8 from 12,400 readers and a quote) is placeholder text. Default: hide until real figures and a consented quote exist.
5. Effect of "I'm an author" beyond storage: default is to swap the "Follow an author" card on `s-all-set` for "Become an author". Confirm.
6. Forgot password screen is missing from the prototype; default sheet described in rule 11 needs a design.
7. Existing-email message reveals that an account exists (rule 4). Keep, or use a generic message?
8. Which v25 password hash formats Supabase Auth accepts is unconfirmed; unsupported ones fall back to a forced reset.
9. Where to ask for notification permission (default: Go to Home on first run).
10. Phone prefix is +234 only in the prototype but Country is a free choice; default: show the matching country calling code from the Country field.
