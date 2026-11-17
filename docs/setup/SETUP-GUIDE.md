# Arpedia setup guide

Everything that has to exist before the build starts, in order. Follow it yourself, or let **Claude Desktop with computer use** drive Chrome while you handle the steps marked **🙋 You**.

- **Time:** about 3–5 hours of clicking. Flutterwave business approval takes a few days; Google Play and Apple already exist from v25.
- **Account:** every sign-up uses **arpedia.africa@gmail.com**, so nothing is tied to a personal account.
- **Menus:** service menus change often. If a label differs slightly, look for the nearest match. The goal of each step is stated so you can find it.

**Legend**
- **🙋 You:** payments, identity checks, legal agreements, phone codes, anything that needs your judgement. Computer use stops here.
- **🔑 Save:** add the value to the secrets file (`C:\Users\PC\arpedia-secrets\secrets.env`) as `NAME=value` under the exact name shown. Never paste it into a chat, a document, an email or any file inside the project folder.
- **⏱:** rough time.

---

## Part 0 · Get ready (⏱ 30 min)

### 0.1 The secrets folder (temporary, until we move to a password manager)
1. Create the folder **`C:\Users\PC\arpedia-secrets\`**.
   - It sits **outside** the project folder, so it can never be committed, pushed or read by a build.
   - Don't put it in OneDrive, Desktop or Documents if those sync to the cloud.
2. In it, create **`secrets.env`** with Notepad (Save as type "All files", encoding UTF-8). Write one key per line:
   ```
   SUPABASE_STAGING_URL=https://abcd.supabase.co
   ```
   No quotes and no spaces around `=`. The sync script in Part 15 reads these exact names, so spelling matters.
3. **Key files (JSON):** save them in the same folder with the file names given in each step. Then add a line pointing to the file with `@`, e.g. `FCM_SERVICE_ACCOUNT_JSON=@fcm-service-account.json`.
4. **Account passwords:** let Chrome's **"Suggest strong password"** create and save them (in the Arpedia Chrome profile's Google Password Manager). Don't write them in the file.
5. **Backup codes** for two-step sign-in go in **`backup-codes.txt`** in the same folder.
6. **Rules:**
   - Never copy these files into the project, email them, upload them, or paste them into a chat.
   - Make one backup copy on a USB drive kept somewhere safe.
   - When we move to a password manager later, delete the folder.

### 0.2 Authenticator app for 2-step codes
1. 🙋 Install **2FAS** or **Google Authenticator** on your phone.
2. Each time a service offers two-step sign-in, scan its QR code with this app, and save the **backup codes** in `backup-codes.txt` under the service's name.

### 0.3 A card that works for dollar subscriptions
- Supabase, Vercel, Cloudflare and Google Play charge in **US dollars**. Many naira cards are declined for international subscriptions.
- 🙋 Have a **USD-enabled card** ready: a dollar virtual card from your bank or a fintech, funded with at least **$100** for the first month and the one-off fees.
- Monthly running cost after setup: **about $50**:

| Service | Cost |
|---|---|
| Supabase Pro | $25 |
| Vercel Pro | $20 |
| Cloudflare | $5 |

  Google Play is already paid under v25. Apple is covered by the partner's account.

### 0.4 Business documents, for Flutterwave
🙋 Gather as PDFs or clear photos:
- CAC certificate and status report (if Arpedia is registered)
- each director's government ID (NIN slip, passport or driver's licence) and BVN
- proof of address (utility bill under 3 months old)
- company bank account details

### 0.5 Secure the Gmail itself
1. Sign in to **arpedia.africa@gmail.com** in Chrome. Use a separate Chrome profile named "Arpedia" so it never mixes with personal accounts.
2. Google Account → Security → **2-Step Verification** → turn on. 🙋 You confirm with your phone.
3. Add a **recovery phone** and a **recovery email** (a personal address).
4. 🔑 Save the Google backup codes as a Secure Note `Google backup codes`.

---

## Part 1 · GitHub: where the code lives (⏱ 20 min)

### 1.1 Create the account
1. Go to **github.com/signup**.
2. Email: **arpedia.africa@gmail.com**. Password: let Chrome suggest a strong password and save it. Username: **`arpedia-africa`**, or the closest available.
3. 🙋 Solve the puzzle and enter the code GitHub emails you.
4. Skip the personalisation questions and choose the **Free** plan.

### 1.2 Turn on two-step sign-in
1. Avatar (top right) → **Settings** → **Password and authentication** → **Enable two-factor authentication**.
2. 🙋 Scan the QR with your authenticator and type the code.
3. 🔑 Download the recovery codes and save them as a Secure Note `GitHub recovery codes`.

### 1.3 Create the organisation
1. Avatar → **Your organizations** → **New organization** → **Free**.
2. Organization name **`arpedia`** (or `arpedia-africa` if taken). Contact email arpedia.africa@gmail.com. "Belongs to: My personal account".
3. Optional: invite your personal account (**Chifurumnanya1**) as a **Member**. Org → People → Invite member.

### 1.4 Install the Claude GitHub app (needed for the cloud build loop)
1. Open **github.com/apps/claude** → **Install**.
2. Choose the **`arpedia`** organisation → **All repositories** → **Install**.
3. 🙋 Approve with your 2-step code if asked.

### 1.5 Sign this computer's GitHub CLI in to the new account
🙋 You do this. Type it in the Claude Code chat box with the `!` prefix so it runs here:
```
! gh auth login
```
Answer the prompts:
1. **GitHub.com**
2. **HTTPS**
3. **Authenticate Git with your GitHub credentials?** → Yes
4. **Login with a web browser**
5. Copy the one-time code, press Enter, and approve it in the **Arpedia** Chrome profile while signed in as `arpedia-africa`.

Check it worked:
```
! gh auth status
```
You should see both accounts, with **arpedia-africa** active. `gh auth switch` swaps between them.

---

## Part 2 · Supabase: database and sign-in (⏱ 30 min)

### 2.1 Account and organisation
1. **supabase.com** → **Start your project** → **Continue with GitHub** → authorise as `arpedia-africa`.
2. Create organisation **Arpedia**, type **Company**, plan **Free** for now.

### 2.2 Staging project
1. **New project**:
   - Name `arpedia-staging`
   - Database password: **Generate** (🔑 save as `SUPABASE_STAGING_DB_PASSWORD`)
   - Region **West EU (London)** (`eu-west-2`)
2. Wait about 2 minutes for it to finish setting up.
3. Project Settings → **General**: 🔑 save **Project ID / Reference** as `SUPABASE_STAGING_REF`.
4. Project Settings → **Data API**: 🔑 save **Project URL** as `SUPABASE_STAGING_URL`.
5. Project Settings → **API Keys**:
   - 🔑 save the **publishable** (or `anon`) key as `SUPABASE_STAGING_ANON_KEY`
   - 🔑 save the **secret** (or `service_role`) key as `SUPABASE_STAGING_SERVICE_KEY`

   > ⚠️ The secret key bypasses all security. It only ever goes into the secrets file and server secrets.

### 2.3 Production project
1. Repeat 2.2 with name **`arpedia-prod`**, same London region. Save the same five values with `PROD` in place of `STAGING`.
2. 🙋 Organisation → **Billing** → upgrade to **Pro ($25 a month)** and enter the card. Production needs Pro for daily backups and no pausing; staging can stay on Free.

### 2.4 Security settings, both projects
1. Authentication → **Sign In / Providers**: Email **on**, "Confirm email" **on**. Leave Google off; it's switched on in Part 8.
2. Authentication → **Rate limits**: leave the defaults.
3. Project Settings → **Database** → **Network restrictions**: leave open for now (Cloudflare Workers need access).

---

## Part 3 · Cloudflare: server code, chat and files (⏱ 30 min)

### 3.1 Account and plan
1. **dash.cloudflare.com/sign-up** with arpedia.africa@gmail.com, with a Chrome-suggested strong password.
2. Verify the email, then Profile → **Authentication** → turn on two-step sign-in (🙋 scan, 🔑 save the backup codes).
3. 🙋 **Workers & Pages** → **Plans** → **Workers Paid ($5 a month)** → enter the card.

### 3.2 R2 file storage
1. Sidebar **R2 Object Storage** → 🙋 accept the R2 terms (it asks for the card on file; storage stays free up to 10 GB).
2. **Create bucket** four times, location **Automatic** (or **Western Europe**):
   - `arpedia-books-staging`
   - `arpedia-books-prod`
   - `arpedia-media-staging`
   - `arpedia-media-prod`
3. R2 → **Manage R2 API Tokens** → **Create API token**:
   - Name `arpedia-r2`
   - Permission **Object Read & Write**
   - Apply to the **4 buckets above**

   Then 🔑 save **Access Key ID** as `R2_ACCESS_KEY_ID` and **Secret Access Key** as `R2_SECRET_ACCESS_KEY`. They're shown once.

### 3.3 Account id and deploy token
1. Workers & Pages overview, right side → 🔑 save **Account ID** as `CLOUDFLARE_ACCOUNT_ID`.
2. Profile (top right) → **API Tokens** → **Create Token** → **Create Custom Token**:
   - Name `arpedia-deploy`
   - Permissions, all **Account** level:
     - Workers Scripts: Edit
     - Workers KV Storage: Edit
     - Workers R2 Storage: Edit
     - Account Settings: Read
     - D1: Edit (optional)
   - Account resources: Include → **your account**
   - **Continue** → **Create Token**

   Then 🔑 save it as `CLOUDFLARE_API_TOKEN`.

---

## Part 4 · Vercel: hosts the admin console (⏱ 15 min)
1. **vercel.com/signup** → **Continue with GitHub** → `arpedia-africa`.
2. When asked, choose **Pro**: the admin is business use, which the free Hobby plan doesn't allow. Team name **Arpedia**. 🙋 Enter the card ($20 a month).
3. Team **Settings** → **General**: 🔑 save **Team ID** as `VERCEL_TEAM_ID`.
4. Avatar → **Account Settings** → **Tokens** → **Create**:
   - Name `arpedia-ci`
   - Scope **Arpedia**
   - Expiration **No expiration** (or 1 year, with a calendar reminder)

   Then 🔑 save it as `VERCEL_TOKEN`.
5. Team Settings → **Git** → connect GitHub and grant access to the **`arpedia`** organisation. Don't import a project; flow 00 does that.

---

## Part 5 · App signing for fastlane (⏱ 20 min)
We build and release with **fastlane** (on GitHub Actions), not Expo's EAS cloud.
- **Android:** ships as an **update to the v25 app** (`com.arpedia.reader`), signed with v25's upload key.
- **iOS:** a **new app** under a partner's Apple Developer account that gives us access (Part 7b).

### 5.1 Android upload key: ✅ done
Copied from the v25 project (`C:\Users\PC\projects\Arpedia\mobile`) into the secrets folder:
- `upload-keystore.jks`
- `play-service-account.json`
- `google-services.json`

The key alias and both passwords are filled in `secrets.env`. The v25 project is unchanged.
- **Package name:** `com.arpedia.reader`.
- **If an upload is ever rejected for the wrong key:** Play Console → app → **Setup → App integrity → Request upload key reset**. 🙋 Google approves it in about 2 days.

### 5.2 iOS signing (partner's Apple team)
Done in Part 7b. fastlane **match** keeps iOS certificates in a private repo, `arpedia/certificates`, encrypted with a password:
- 🔑 save a **new** `MATCH_PASSWORD` (Chrome can suggest one). Don't reuse v25's.
- Claude Code creates that repo when iOS starts.

---

## Part 6 · Google Cloud and Firebase: image checks, push notifications, Google sign-in (⏱ 40 min)

### 6.1 Google Cloud project
1. **console.cloud.google.com** (signed in as arpedia.africa@gmail.com).
2. **Use the v25 project.** v25's Play service account and Firebase config (`google-services.json`, already copied) belong to an existing Google Cloud project. Open the project picker and select it; the Firebase console shows the same project. Only if you can't find it: 🙋 **New project** named `arpedia`.
3. 🙋 **Billing** → link a billing account and card. Vision is free for the first 1,000 images a month; this also unlocks the APIs.

### 6.2 Vision API (image moderation)
1. **APIs & Services** → **Library** → search **Cloud Vision API** → **Enable**.
2. **APIs & Services** → **Credentials** → **Create credentials** → **API key**.
3. **Edit API key**: name `vision-server`, API restrictions **Restrict key** → only **Cloud Vision API** → Save.
4. 🔑 Save it as `GOOGLE_VISION_API_KEY`.

### 6.3 Firebase (push notifications)
1. **console.firebase.google.com** → open the **v25 project**. Its Android app `com.arpedia.reader` is already there, and its `google-services.json` is already in the secrets folder (✅).
2. **iOS app (once Part 7b is done):** **Add app** → **iOS**, bundle id **`africa.arpedia.reader`** → download `GoogleService-Info.plist` → 🔑 save it in the secrets folder and add `FIREBASE_IOS_PLIST=@GoogleService-Info.plist`. Then Project settings → **Cloud Messaging** → Apple app configuration → upload the **APNs key** from Part 7b.
3. Nothing else to download for Android.
4. Gear → **Project settings** → **Service accounts** → **Generate new private key** → download the JSON. 🔑 Save it in the secrets folder as `fcm-service-account.json`, add the line `FCM_SERVICE_ACCOUNT_JSON=@fcm-service-account.json`, then delete it from Downloads.

### 6.4 Google sign-in (OAuth)
1. Cloud console → **Google Auth Platform** (formerly "OAuth consent screen") → **Get started**:
   - App name **Arpedia**
   - support email arpedia.africa@gmail.com
   - Audience **External**
   - contact email the same → Create
2. **Branding:**
   - logo: the sunflower mark from `assets/brand/`
   - home page `https://arpedia.africa`
   - privacy policy and terms URLs (add when ready)
3. **Clients** → **Create client** → type **Web application**:
   - name `supabase-auth`
   - Authorised redirect URIs: `https://<SUPABASE_STAGING_REF>.supabase.co/auth/v1/callback`, and the same with the prod ref
   - Create

   Then 🔑 save **Client ID** as `GOOGLE_OAUTH_CLIENT_ID` and **Client secret** as `GOOGLE_OAUTH_CLIENT_SECRET`.
4. In **Supabase** (both projects) → Authentication → Sign In / Providers → **Google** → enable, paste the client id and secret → Save.
5. Also create an **Android** OAuth client:
   - package = the v25 package name
   - SHA-1 = the **app signing key** fingerprint from Play Console → app → Setup → App integrity
   - add a second one with the upload key's SHA-1 for test builds

   Nothing to save; Android clients have no secret.

---

## Part 7 · Google Play Console: the existing v25 account (⏱ 15 min)
**Nothing new to create.** The v25 Play account on arpedia.africa@gmail.com and its app listing stay. The rebuild ships as an **update to the same app**, so installs, reviews and paying subscribers carry over.
1. Open **play.google.com/console** as arpedia.africa@gmail.com and select the v25 app.
2. **Check the existing service account** (its key is already in the secrets folder as `play-service-account.json`, the one v25's fastlane used):
   1. Play Console → **Users and permissions**. Find the service account's email (it ends in `iam.gserviceaccount.com`).
   2. Make sure it has app permissions **View financial data**, **Manage orders and subscriptions**, and **Release to testing tracks** (fastlane needs the last one to upload builds). Add it if missing → Save.
   3. `secrets.env` already points to it (✅).
3. Play Console → app → **Testing → Internal testing**: add yourself and the team as testers. The cloud build uploads every merged flow here.
4. **Later, at launch (flow 17):** the rebuild goes to production as a normal update after an internal and closed test. No new review account is needed.

## Part 7b · Apple: access through a partner's developer account (⏱ 30 min, once access is given)
**iOS is a new app, `africa.arpedia.reader`**, published under **another organisation's Apple Developer account**, which gives **arpedia.africa@gmail.com** access.
- No enrolment, no D-U-N-S and no $99 fee on our side.
- The old Apple account isn't used. Its keys are in `arpedia-secrets\legacy-ios-old-account\`.
- The App Store shows **that account's legal name as the seller**. Agree this with them.

1. **Get invited.** 🙋 The account holder opens App Store Connect → **Users and Access** → **+**, enters arpedia.africa@gmail.com, and gives:
   - role **Admin**, so we can create keys and the app; or **App Manager + Developer**, if they want to keep keys themselves
   - **Access to Certificates, Identifiers & Profiles**
   - **Access to Reports** (sales numbers)

   Accept the email invite while signed in as arpedia.africa@gmail.com, creating an Apple ID with that email if asked. 🙋 Turn on two-step sign-in for that Apple ID.
2. Note the team's **Team ID** (developer.apple.com → Account → Membership details). 🔑 Save it as `APPLE_TEAM_ID`.
3. **Identifiers:** Certificates, IDs & Profiles → **Identifiers** → **+** → App IDs → App:
   - Bundle ID **`africa.arpedia.reader`** (explicit)
   - Capabilities: **In-App Purchase**, **Push Notifications**, **Sign in with Apple**, **Associated Domains**
4. **App Store Connect:** Apps → **+ New App**:
   - platform iOS, name **Arpedia**
   - bundle `africa.arpedia.reader`, SKU `arpedia-ios`
5. **Paid Apps agreement:** 🙋 check with the account holder that **Agreements, Tax and Banking** has an active **Paid Apps** agreement. In-app purchases don't work without it. **Agree how sales money reaches Arpedia**, since Apple pays the account holder.
6. **Keys.** If our role is Admin, we create them. Otherwise the account holder creates them and sends the files through a private channel, never by email.
   - **App Store Connect API key, for fastlane:** Users and Access → **Integrations** → App Store Connect API → **+**, name `arpedia-fastlane`, role **App Manager**. 🔑 Save it as `AuthKey_asc.p8` and fill `ASC_KEY_ID` and `ASC_ISSUER_ID`.
   - **APNs key, for push:** Certificates, IDs & Profiles → **Keys** → **+**, name `arpedia-push`, Apple Push Notifications service. 🔑 Save it as `AuthKey_apns.p8` and fill `APNS_KEY_ID`. Upload it to Firebase (Part 6.3).
   - **Sign in with Apple key:** Keys → **+**, name `arpedia-signin`, Sign in with Apple (primary App ID `africa.arpedia.reader`). 🔑 Save it as `AuthKey_signin.p8`.
   - **Services ID:** Identifiers → **+** → Services IDs, identifier `africa.arpedia.signin`. Enable Sign in with Apple, then:
     - domain: the Supabase project domain
     - return URL: `https://<SUPABASE_PROD_REF>.supabase.co/auth/v1/callback`

     🔑 Save it as `APPLE_SIGNIN_SERVICE_ID`.
   - **In-App Purchase key, for RevenueCat:** Users and Access → Integrations → **In-App Purchase** → **+**. Upload it straight to RevenueCat (Part 8). Don't keep a copy.
7. **Signing certificates:** fastlane `match` creates them in this team, stored in our private `arpedia/certificates` repo. If our role doesn't allow creating certificates, the account holder runs `fastlane match appstore` once with us.
8. **Sign in with Apple is required on iOS**, because the app offers Google sign-in (App Store rule 4.8). It's in flow 01 for iOS.
9. **v25 iOS subscribers:** their old subscriptions keep running in the old app until they cancel. Through RevenueCat, they keep access in the new app until their old subscription ends, then subscribe in the new one. At launch (flow 17), whoever holds the old account emails them and stops new sales there.

---

## Part 8 · RevenueCat: the existing v25 project (⏱ 10 min)
**Keep the v25 RevenueCat project.** Existing subscribers' entitlements live there, and new plans are added next to the old ones in flow 09.
1. Sign in to **app.revenuecat.com** with the account v25 used. 🙋 If that isn't arpedia.africa@gmail.com, invite arpedia.africa@gmail.com as an **Admin** (Project settings → Collaborators) and use it from now on.
2. Open the v25 project. Check the **Play Store app** has its service-account JSON uploaded (it should; that's the `revenuecat-play` file).
3. **Leave the old App Store app in the project** so v25 iOS subscribers keep their entitlement until it expires.
4. **When Part 7b is done:** **+ Add app** → **App Store**:
   - name `Arpedia iOS (new)`
   - bundle id `africa.arpedia.reader`
   - upload the new **In-App Purchase key** with its key id and issuer id
5. Project → **API keys**:
   - 🔑 save the **public Google Play SDK key** (`goog_…`) as `REVENUECAT_ANDROID_PUBLIC_KEY`
   - the **new App Store app's** key (`appl_…`) as `REVENUECAT_IOS_PUBLIC_KEY`. It doesn't exist until step 4.
   - **+ New secret API key** named `rebuild-server` → 🔑 save as `REVENUECAT_SECRET_KEY`
6. Products, offerings and the webhook to our Worker are set up in flow 09. Old products stay active for existing subscribers until they renew into the new plans.

---

## Part 9 · Flutterwave: web payments and author payouts (⏱ 30 min, then review)
1. **dashboard.flutterwave.com/signup**: country Nigeria, email arpedia.africa@gmail.com, business name Arpedia.
2. Verify the email. Turn on two-step sign-in in Settings → Security.
3. 🙋 **Go-live / Compliance:** fill in business details and upload the documents from 0.4 (CAC, director IDs, BVN, proof of address, bank account). Approval takes days.
4. Meanwhile, toggle the dashboard to **Test mode** → Settings → **API keys**:
   - 🔑 public key → `FLW_TEST_PUBLIC_KEY`
   - 🔑 secret key → `FLW_TEST_SECRET_KEY`
   - 🔑 encryption key → `FLW_TEST_ENCRYPTION_KEY`
5. After approval: save the **live** keys as `FLW_LIVE_*`, and request **Transfers** (payouts) if not already enabled. Needed for flow 13.

---

## Part 10 · Sentry: error tracking (⏱ 10 min)
1. **sentry.io/signup** → **Continue with GitHub** → `arpedia-africa`. Organisation slug `arpedia`, data region **EU**.
2. **Projects** → **Create project** three times:
   - **React Native** → name `mobile`
   - **Next.js** → name `admin`
   - **Cloudflare Workers** (or JavaScript) → name `workers`
3. Each project → Settings → **Client Keys (DSN)** → 🔑 save as `SENTRY_DSN_MOBILE`, `SENTRY_DSN_ADMIN`, `SENTRY_DSN_WORKERS`.
4. Settings → **Auth Tokens** → **Create new token** (org-level, for source maps) → 🔑 save as `SENTRY_AUTH_TOKEN`.

## Part 11 · PostHog: analytics and feature flags (⏱ 5 min)
1. **eu.posthog.com/signup** (EU cloud) → organisation **Arpedia**, project **Arpedia**.
2. Project settings → 🔑 save **Project API key** as `POSTHOG_KEY` and host `https://eu.i.posthog.com` as `POSTHOG_HOST`.

## Part 12 · Resend: sign-in and receipt emails (⏱ 15 min + DNS)
1. **resend.com/signup** with arpedia.africa@gmail.com.
2. **Domains** → **Add domain** → `mail.arpedia.africa` (a subdomain keeps your main email safe) → region **eu-west-1**.
3. It shows **DNS records** (MX, TXT for SPF, CNAME or TXT for DKIM). Add them in Part 13, then click **Verify**.
4. **API Keys** → **Create** `supabase-smtp` with **Sending access** → 🔑 save as `RESEND_API_KEY`.
5. After verification, in **Supabase** (both projects) → Authentication → **Emails** → **SMTP settings** → enable custom SMTP:

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | User | `resend` |
   | Password | the `RESEND_API_KEY` |
   | Sender | `Arpedia <hello@mail.arpedia.africa>` |

---

## Part 13 · Domain arpedia.africa: DNS (⏱ 20 min + waiting)
1. 🙋 Find where **arpedia.africa** is registered (the registrar) and log in.
2. **Recommended:** move DNS to Cloudflare. It's free and lets the Workers use `api.arpedia.africa`.
   1. Cloudflare → **Add a domain** → `arpedia.africa` → **Free** plan. Cloudflare copies your existing records; **check they match what you have today** (website, email MX), so the current site and email keep working.
   2. Cloudflare shows **two nameservers**. 🙋 At the registrar, replace the nameservers with these two. This can take up to 24 hours.
3. Once DNS is on Cloudflare, add:
   - the **Resend records** from Part 12 (DNS only, grey cloud)
   - `admin.arpedia.africa`: added in flow 00 when Vercel gives the record
   - `api.arpedia.africa`: added in flow 00 as a Worker route
4. **Can't move DNS?** Add the same records at the registrar instead.

---

## Part 14 · Hand over to the coding session (⏱ 5 min)
In Claude Code, type:
> Accounts ready.

Then I:
1. Initialise git, create the private repo **`arpedia/arpedia`** with the new account, and push the docs, prototypes and tools.
2. Have you run the secrets sync (Part 15).
3. Set up the cloud build schedules (Part 16).

## Part 15 · Copy secrets into GitHub without passing them through chat (⏱ 5 min)
🙋 You run this in a normal **PowerShell** window, not in the Claude chat. That way values go straight from the secrets file to GitHub and are never shown.
```powershell
cd C:\Users\PC\projects\Arpedia_Rebuild
node tools/sync-secrets.mjs --repo arpedia/arpedia --dry-run
node tools/sync-secrets.mjs --repo arpedia/arpedia
```
- It reads `C:\Users\PC\arpedia-secrets\secrets.env` (or another path via `--file`).
- The dry run lists what would be copied and which names are missing.
- The real run copies only the **staging** and CI secrets to the repo's GitHub Actions secrets, printing names, never values. Production keys stay in the file until launch.

Then tell Claude Code "secrets synced".

## Part 16 · Start the cloud build (⏱ 10 min)
After Part 15, say **"start the cloud build"**. I then:
1. Create the **"Build status"** issue in the repo.
2. Create four scheduled cloud agents:
   - **L1**: critical path, every 2 hours
   - **L2**: product screens, every 2 hours
   - **L3**: money and ops, every 2 hours
   - **fix**: every 4 hours
3. Trigger **L1** now to build flow 00. When flow 00 merges, L1 and L2 start flows 12 and 01, once you answer Q88–92 and Q47–52 (or accept the defaults).

---

## Final checklist
- [ ] 0 Secrets folder `C:\Users\PC\arpedia-secrets` with `secrets.env`, authenticator app, USD card, business documents, Gmail 2-step
- [ ] 1 GitHub `arpedia-africa` + organisation `arpedia` + Claude app + `gh` signed in
- [ ] 2 Supabase staging (Free) and prod (Pro), London, keys saved
- [ ] 3 Cloudflare Workers Paid, 4 R2 buckets, R2 token, deploy token, account id
- [ ] 4 Vercel Pro team Arpedia, token, team id, GitHub connected
- [x] 5 v25 Android upload keystore, passwords, alias, Play service account and Firebase config in the secrets folder (`com.arpedia.reader`)
- [ ] 6 v25 Google Cloud project, Vision key, FCM key, OAuth web + Android clients, Google enabled in Supabase (Firebase iOS app after 7b)
- [ ] 7 Existing Play account: service account permissions checked, internal testers added
- [ ] 7b Invited to the partner's Apple team (Admin), App ID `africa.arpedia.reader`, App Store Connect app, Paid Apps agreement checked, ASC / APNs / Sign in with Apple / IAP keys
- [ ] 8 v25 RevenueCat project: arpedia.africa@gmail.com is admin, new App Store app added after 7b, keys saved
- [ ] 9 Flutterwave test keys, compliance submitted (approval can be pending)
- [ ] 10 Sentry 3 projects + auth token
- [ ] 11 PostHog key + host
- [ ] 12 Resend domain + key, Supabase SMTP once verified
- [ ] 13 DNS on Cloudflare (or records at the registrar)
- [ ] 14 "Accounts ready" → repo pushed
- [ ] 15 Secrets synced to GitHub
- [ ] 16 Cloud build started

## Secret names (lines in `secrets.env`)
| Group | Names |
|---|---|
| Supabase | `SUPABASE_STAGING_REF` `SUPABASE_STAGING_URL` `SUPABASE_STAGING_ANON_KEY` `SUPABASE_STAGING_SERVICE_KEY` `SUPABASE_STAGING_DB_PASSWORD`, and the same five with `PROD` |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID` `CLOUDFLARE_API_TOKEN` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` |
| Vercel | `VERCEL_TOKEN` `VERCEL_TEAM_ID` |
| Android signing ✅ | `ANDROID_UPLOAD_KEYSTORE`📎 `ANDROID_KEYSTORE_PASSWORD` `ANDROID_KEY_ALIAS` `ANDROID_KEY_PASSWORD` `PLAY_SERVICE_ACCOUNT_JSON`📎 |
| Apple (partner team) | `APPLE_TEAM_ID` `MATCH_PASSWORD` `ASC_KEY_ID` `ASC_ISSUER_ID` `ASC_KEY`📎 `APNS_KEY_ID` `APNS_KEY`📎 `APPLE_SIGNIN_SERVICE_ID` `APPLE_SIGNIN_KEY`📎 `FIREBASE_IOS_PLIST`📎 |
| Google | `GOOGLE_VISION_API_KEY` `GOOGLE_OAUTH_CLIENT_ID` `GOOGLE_OAUTH_CLIENT_SECRET` `FIREBASE_GOOGLE_SERVICES_JSON`📎 ✅ `FCM_SERVICE_ACCOUNT_JSON`📎 |
| RevenueCat | `REVENUECAT_ANDROID_PUBLIC_KEY` `REVENUECAT_IOS_PUBLIC_KEY` `REVENUECAT_SECRET_KEY` |
| Flutterwave | `FLW_TEST_PUBLIC_KEY` `FLW_TEST_SECRET_KEY` `FLW_TEST_ENCRYPTION_KEY` (later `FLW_LIVE_*`) |
| Sentry | `SENTRY_DSN_MOBILE` `SENTRY_DSN_ADMIN` `SENTRY_DSN_WORKERS` `SENTRY_AUTH_TOKEN` |
| PostHog | `POSTHOG_KEY` `POSTHOG_HOST` |
| Resend | `RESEND_API_KEY` |

📎 = a file (JSON, .p8, .jks, .plist) in the secrets folder; its line is `NAME=@file-name`.

## If something goes wrong
- **Card declined:** use a USD virtual card, or ask the bank to enable international online payments. Retry after a few minutes; some services block repeated tries for an hour.
- **Play verification stuck:** make sure the name on the ID exactly matches the account name; reply to Google's email with clearer photos.
- **Flutterwave asks for more documents:** upload them from the Compliance page; approval restarts from there.
- **Lost a secret:** don't search old chats. Rotate it (create a new one in the service, delete the old) and update `secrets.env`.
- **Computer use gets confused by a changed menu:** tell it the goal of the step (shown in each heading) rather than the exact click.

## Prompt for Claude Desktop (computer use)
> Open the attached SETUP-GUIDE.md and follow it part by part, starting at Part 1, in the "Arpedia" Chrome profile signed in as arpedia.africa@gmail.com.
> - Stop and hand over to me at every 🙋 step: payments, identity checks, legal agreements, 2-step codes, choosing passwords.
> - For every 🔑 step, open C:\Users\PC\arpedia-secrets\secrets.env in Notepad (computer use) and add a line NAME=value with the exact name from the guide, then save. Save 📎 JSON files into C:\Users\PC\arpedia-secrets with the file name given and add the NAME=@file line. Delete downloaded copies.
> - Never write a secret into this chat or any other file, and never into the project folder. When reporting, say "saved NAME", never the value.
> - After each part, tick it in the final checklist and tell me what's next.
