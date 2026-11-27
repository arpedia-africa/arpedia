# Play Store checklist

Everything Google Play needs before the closed beta and the production rollout of `com.arpedia.reader`. The owner fills these in Play Console (the app listing already exists from v25). Steps for releasing: [RUNBOOK.md](RUNBOOK.md).

## App and build
- [ ] Package `com.arpedia.reader`, signed with the **v25 upload key** (Play App Signing keeps the app key).
- [ ] Version code above 25 (starts at 26; fastlane raises it every upload). Version name `26.0.0`.
- [ ] Target API level meets Play's current requirement (Expo SDK default).
- [ ] Built without `EXPO_PUBLIC_KIT` and with production URLs (preflight `release_endpoints`, `expo_public_kit`).
- [ ] **Permissions** in the release: internet, notifications, vibrate, camera (only when the reader takes a profile photo). Microphone, overlay and external storage are blocked in `app.json` (`blockedPermissions`); check the merged manifest of the first release in Play Console → App bundle explorer, and update this list if anything else appears.

## Store listing
- [ ] **App name:** Arpedia
- [ ] **Short description** (80 characters max), plain Nigerian English, e.g. "African stories by the chapter. Read, discuss and support the authors you love."
- [ ] **Full description** (4,000 max): what it is, credits and plans (state that 1 credit = ₦3 and that books cost credits), clubs and reading rooms, authors earn from every credit spent.
- [ ] **What's new** for the first release (Q7 default): "A brand-new Arpedia. This is a fresh start: please create a new account. Anything you paid for in the old app, contact us and we'll sort it out."
- [ ] App icon 512×512, feature graphic 1024×500.
- [ ] Phone screenshots (at least 4, 1080×1920 or similar): Home, book page with price, reader, Library, a club. From a release build with real books, never the kit gallery.
- [ ] Category: Books & Reference. Tags: books, reading, stories.
- [ ] Contact email (support@arpedia.africa or the owner's choice), website `https://arpedia.africa`.
- [ ] **Privacy policy URL:** `https://arpedia.africa/legal/privacy` (the website serves the published Privacy policy, RUNBOOK §2). The page must be live and match the Data safety answers.
- [ ] Terms: `https://arpedia.africa/legal/terms`.

## App content (Policy → App content)
- [ ] **Privacy policy** URL as above.
- [ ] **App access:** sign-in required. Give reviewers a working demo reader account on production (with a few credits), and say where sign-in is.
- [ ] **Ads:** the app has no ads.
- [ ] **Content rating** (IARC questionnaire): reference app / books; users interact (chat, clubs, comments, direct messages to authors); users can share content; digital purchases. Books carry age ratings and content notes; readers are 16+.
- [ ] **Target audience:** 16 and over (Q1 answered: 16+ only). Not designed for children.
- [ ] **News app:** no. **Government app:** no. **Financial features:** none (in-app purchases only). **Health:** no.
- [ ] **Data safety** form (below).
- [ ] **Account deletion:** in the app (Profile → Settings → Delete account, flow 10) **and** a web link where someone can ask for deletion without the app (Play requirement). The page is `https://arpedia.africa/legal/delete-account`: the website always shows the in-app steps and an email request to support (even when the database is down), then the published Delete-account text. Enter it in Data safety → Data deletion.

### Data safety answers
Encrypted in transit: **yes**. Users can request deletion: **yes** (in app and on the web page). Data is not sold. Confirm each row with the privacy policy before submitting.

| Data type (Play's names) | Collected | Why | Optional | Shared with (processors) |
|---|---|---|---|---|
| Name, email address | yes | account, sign-in, support | no | Supabase (hosting), Resend (email) |
| Phone number | yes, if given | account recovery, author payouts | yes | Supabase |
| Date of birth (other personal info) | yes | age check (16+) | no | Supabase |
| Country / approximate location | yes (country, from the reader) | prices, content | no | Supabase |
| Photos | yes, if the reader adds a profile photo | profile | yes | Cloudflare R2 |
| Purchase history | yes | credits, plans, refunds | no | RevenueCat, Google Play, Flutterwave |
| Financial info (bank account) | authors only | payouts (encrypted at rest) | yes | Flutterwave |
| Messages (in-app messages, other user-generated content) | yes | clubs, rooms, comments, reviews, messages to authors, support | yes | Cloudflare (chat), Supabase |
| App interactions, in-app search history | yes | reading progress, recommendations, analytics | no | PostHog (analytics) |
| Other user-generated content (highlights, notes) | yes | sync between devices | yes | Supabase |
| Crash logs, diagnostics | yes | stability | no | Sentry |
| Device or other IDs | yes | push notifications, download limits, reading licences | no | Expo / Firebase Cloud Messaging |

Not collected: precise location, contacts, calendar, audio, files outside the app, health, web browsing.

## Monetisation
- [ ] **New product ids** for every plan and credit pack (Q2 default); none reuses a v25 id. Old v25 products stay in Play only until every v25 subscription has ended (Q1), then are deactivated.
- [ ] Products and prices match `public.plans` and `public.topup_products` (`play_product_id`).
- [ ] RevenueCat: the same project as v25; the new products attached to the entitlement; the webhook URL `https://<api>/v1/payments/revenuecat` with the `REVENUECAT_WEBHOOK_AUTH` header (preflight checks it rejects a bad one).
- [ ] Licence testers added in Play Console for test purchases during the beta.

## Testing tracks
- [ ] Internal testing: the team.
- [ ] Closed testing (`alpha` unless renamed; set `PLAY_CLOSED_TRACK` to match): about 50 testers for 14 days (Q4), with a feedback email or form that becomes `fix` issues.
- [ ] Production: staged rollout 5% → 20% → 50% → 100%, at least 48 hours apart (RUNBOOK §7).
- [ ] Pre-launch report (Play runs it on upload): no crash, no security warnings.
