# Arpedia Admin prototype: builder brief

Clickable HTML/CSS prototype of the staff web console for Arpedia (arpedia.africa), an African subscription reading community. Desktop-first (1280–1440 wide), must still work at 400px. It is assembled by `admin/build.sh` from `admin/src/*.html` in filename order and published as one private artifact with a per-screen feedback loop.

## Read before building
1. `admin/src/00-head.html`: tokens, atoms (buttons, status pills, avatars, book covers `.cv c1..c8 x32/x40/x56/x80/x120/x160`).
2. `admin/src/00b-components.html`: every component class (panel, kpis, toolbar, search, dd, fchip, seg, bulk, tbl, who, pager, cb, kv, kv-row, list/li, q, form/fgrid/f/inp/ta/hint/switch/setrow/radio/checkrow/drop/file, note, tl, charts cols/axis/legend/hbars/hb/funnel/fn/meter/spark/donut, backdrop/modal/drawer, cmdk, empty, steps/stepper/stp, editor/chapters/chap/diff, phone/push, mx/yes/no/part, msg/quote, toast, auth).
3. `admin/src/10-access-overview.html`: reference screens. Copy their structure exactly: `s-overview` (band header + kpis + split layout + panels), `s-books` (band + tabs + toolbar + bulk bar + table + pager), `s-cmdk` / `s-staff-alerts` (overlay screens).
4. `admin/src/02-shell.html`: sidebar nav keys (`data-key`) you must point screens at with `data-nav`.

## Screen markup contract
```html
<section class="screen" id="s-<id>" data-area="<n>" data-nav="<sidebar key>" data-name="<Short name>" data-note="Same as v25: …|New: …|Fixed: …|Rule: …|Data: …" hidden>
  <div class="band"> … </div>            <!-- top-level list/landing pages: orange band with petals -->
  <!-- OR for detail pages: -->
  <div class="ph"><div class="crumbs"><a data-go="books">Books</a><svg class="ico" aria-hidden="true"><use href="#i-chev"/></svg><span>Title</span></div><div class="ph__row"><div class="ph__title"><h1>Title <span class="st st-info">In review</span></h1><div class="ph__meta">…</div></div><div class="ph__acts">…buttons…</div></div></div>
  <div class="tabs" role="tablist">…</div>   <!-- optional; tabs that are real screens use data-go, cosmetic ones use data-single + aria-selected -->
  <div class="page"> … panels … </div>
</section>
```
- Overlays (modal / drawer / confirm): `class="screen overlay"` + `data-base="<screen id it sits on>"`, contents: `<a class="backdrop" data-go="<base>" aria-label="Close"></a><div class="modal" role="dialog" aria-label="…">` with `.modal__h`, `.modal__b`, `.modal__f`. Use `.modal.danger` for destructive, `.modal.wide` for wide, `.drawer` for side panels. Cancel/close buttons `data-go="<base>"`; confirm buttons go to the resulting screen.
- Navigation: `data-go="<screen id>"` on any element (rows `<tr data-go>`, `.li`, buttons). Every `data-go` target MUST exist (in your file or the list of existing/assigned ids below). Do not invent targets outside the master list.
- Interactions handled globally: `.switch` toggles `.on`; `.cb` toggles `.on`; children of `[data-single]` get `.is-selected` (+ aria-selected); children of `[data-multi]` toggle `.is-selected`. No other JS. No inline `<script>`.
- Inline `style` only for data values (`--v:62%` on bars/meters, `--g` conic gradient on donuts, widths). Put any new CSS in ONE `<style>` block at the top of your file, every class prefixed with your prefix (e.g. `.ct-`). Prefer existing components; add new ones only when truly needed.
- `data-note`: pipe-separated bullets shown in the prototype Notes panel. Start bullets with `Same as v25:`, `New:`, `Fixed:`, `Rule:` (business rule) or `Data:` (where numbers come from). Every screen gets 2–5 useful notes: what staff do there, rules enforced, what happens after actions (who is notified).
- Icons: `<svg class="ico s" aria-hidden="true"><use href="#i-NAME"/></svg>`. Available ids: home lib users user search bell bookmark share back x more star book chat pen send list aa copy down arrow chev chevd heart check plus lock gift coin cog moon eye mail flag ban trash upload file chart bank clock fire filter grid rows cloud trophy reply smile pin shield info help out cal key hash door wallet image quote volume sparkle phone g apple sun layout inbox refresh ext activity alert ucheck ux uplus layers terminal code zap chevu trendup trenddown sort folder link monitor mobile listcheck archive undo eyeoff percent shieldok play pause edit globe ticket bookcheck rocket servers calcheck login unlock pie line stop xcircle kanban columns table label copyright checkc toggle tune package notif speaker minus usersg chevl2 menu arrowl arrowdown arrowup dollar.

## Design rules (strict)
- Brand: orange `--org` #F5931F fills, text on orange is always `--night`; orange text uses `--org-ink`. Fonts: Bricolage (titles, big numbers), Inter (UI), Literata (book text, quotes), JetBrains Mono (ids, codes) via `.mono`.
- NO icons inside cards, list rows, callouts or empty states (user rule). Icons only on controls: buttons, tabs, inputs, sidebar, chevrons in rows. No icon tiles.
- No side-stripe borders, no gradient text, no glassmorphism, no hero-metric cliché with gradients, no identical icon card grids, no small uppercase eyebrows above sections, no nested panels.
- Status always text + colour (`.st st-ok|warn|err|info|org|night`), never colour alone.
- Tables: wrap in `.tw` inside `.panel.panel--flush`, numbers right-aligned `.n`, keep column count ≤ 8 so it fits ~1100px.
- Copy: plain, friendly Nigerian-English, specific. Real names, real amounts in ₦ with thousands separators, real dates (today is Thursday 12 November 2026). No lorem ipsum. Sentence case. Buttons say what happens ("Approve and publish", "Release ₦3,918,450").
- Every important state designed: empty, error, warning, confirmation, permission-limited, where relevant.
- Density: this is a work tool. Compact, scannable, generous only around decisions.

## Product facts (use exactly)
- Roles in the app: Reader, Author (reader approved through a 5-step application: personal details, about you/bio, genres and writing, writing sample file upload, payout and agreement). Staff roles: Super admin, Operations admin, Publisher (formats/reviews books), Moderator, Finance, Support, Analyst (read-only). Two-step sign-in required.
- Plans (3): Monthly, Quarterly, Yearly. In-app (Google Play via RevenueCat) prices ₦900 / ₦2,400 / ₦8,400; web checkout (Flutterwave) ₦800 / ₦2,100 / ₦7,500. Credits per period 300 / 800 / 3,000 (Yearly includes 200 bonus). Unused credits roll over one period, capped at one plan's worth. Store product ids like `arpedia_monthly_v3`, `arpedia_quarterly_v3`, `arpedia_yearly_v3`.
- Top-ups (subscribers only): 200 = ₦600, 500 = ₦1,500, 1,000 = ₦3,000 (`arpedia_topup_200` etc.). 1 credit = ₦3.
- Free preview: first 10% of every book. Price = ceil(standard pages ÷ 2) credits; standard page = 250 words, full-page image = 1 page. Readers Unlock all or Pay as you read (per chapter, never more than the full price, undo within 10 minutes). Unlocked books stay in the library forever.
- Messaging an author costs 5 credits; author replies free. Tips and gifts are paid in credits.
- Author earnings: a fixed ₦1.60 per credit spent on the author's books (unlocks, chapters, tips, messages), from the credit ledger; undone chapters, refunds and gift loops excluded; 30-day hold from cycle close; minimum payout ₦1,000 (below that carries to next month). Paid by Flutterwave bank transfer to a verified Nigerian bank account (masked, e.g. GTBank ••••4471). See the v4 section below and docs/prd/13-earnings-payouts.md (current source of truth).
- Book pipeline: see docs/prd/12-book-pipeline.md and docs/prd/ARCHITECTURE.md (local-first conversion, Worker verification, staff desk for PDFs). The older formatter-first description is superseded.
- Discover sections in the app: Trending this week (curated), Arpedia authors, New arrivals (auto), Top 10 (auto, with pins/excludes), Recommended for you (algorithm from interests), Coming soon (curated), Browse genres. Genres: Christian & Faith, Clean romance, African stories/Nigerian books, Fiction, Thriller, Short stories, Poetry, Young adult, Non-fiction, Devotionals.
- Community: every book has a room (discussions on paragraphs), author community channels (created automatically when an author is approved), official channels, reading rooms (live, scheduled, with join codes), DMs to authors, reviews with replies, author posts and comments. Report reasons (8): Spam or scams, Harassment or bullying, Hate speech, Sexual content, Violence or threats, Spoilers, Impersonation, Something else. Reported content types: message, discussion comment, review, post comment, author post, reading-room chat, profile, book, DM. Blocking exists for readers.
- Integrations: Supabase (database, auth, edge functions), RevenueCat (store purchases → webhook), Google Play, App Store, Flutterwave (web checkout + payouts), Firebase Cloud Messaging (push), Cloudflare R2 (files), expo-updates OTA (updates.arpedia.africa), Resend/email.
- Privacy law: Nigeria Data Protection Act (NDPA) 2023, respond to data requests within 30 days.

## Shared sample data (stay consistent)
- Staff: Amaka Okafor (Super admin, signed in, av `g` "AO"), Tunde Bakare (Publisher, `b` TB), Ifeanyi Obi (Publisher, `t` IO), Zainab Yusuf (Moderator, `m` ZY), Chinedu Eze (Finance, `k` CE), Bisi Adeyemi (Support, `r` BA), Femi Lawson (Operations admin, `o` FL), Kemi Danjuma (Analyst, `n` KD).
- Readers: Ngozi Eze (Quarterly, Lagos, joined 4 Mar 2026, 840 credits, ngozi.eze@gmail.com), Chiamaka Obi, Tunji Adebisi, Hauwa Musa, Kelechi Nwosu, Funke Alabi, Ibrahim Lawal, Ngozi Okonkwo, spam account @lagosdeals.
- Authors and live books (cover class): Ifeoma Nwachukwu, Harmattan Letters (c1, Christian & Faith, 62k, Standard 90 credits, 4.7★, 18K reads); Chioma Okafor, Still Waters, Lagos (c2); Adaeze Rosemary Possible, The Alignment (c3, Long); Musa Danladi, Seven Bridges to Jos (c4); Tolu Adebayo, Ruth of Ibadan (c5); Kemi Ogunleye, A House Called Grace (c6); Emeka Obi, Psalms for the Danfo (c7, poetry); Halima Bello, Bread on Water (c8).
- Pipeline books: Market Day in Onitsha (Obiageli Nnaji, Word, Needs formatting), The Prayer Warrior's Wife (Grace Effiong, PDF, Needs formatting), Lagos Lagoon Love (Temi Adewale), Okada Man's Prayer (Sunday Ojo), Garden of Small Mercies (Esther Akande, EPUB, In review), The Alignment revision 4 (update in review), Kano Nights (Abubakar Sani, In review, has a copyright claim from Paramount Books Ltd), Daughters of Zion Street (Ruth Okoro), Songs for Mama Ijeoma (Chidi Nwachukwu).
- Applicants: Blessing Udo (clean romance, Port Harcourt, 6 days waiting), Yemi Coker, Aisha Bello, Daniel Okeke, Precious Etim, Musa Ibrahim, Grace Nnamdi.
- Numbers: 38,240 registered readers; 21,900 monthly active; 4,812 active subscribers (Monthly 2,904, Quarterly 1,371, Yearly 537; 71% Google Play, 9% App Store, 20% web); 412 live books; 131 authors (63 earning); 18 open reports; 12 open support tickets.

## Existing screen ids (already built; you may link to them)
signin signin-2fa signin-reset no-access overview cmdk staff-alerts books

## All screen ids being built (any may be a data-go target)
Catalogue (A): book book-formatter book-preview book-changes book-approve book-revisions book-access book-stats book-unpublish book-new curation curation-trending curation-coming genres search-tuning
People (B): users user user-credits user-activity user-safety user-grant user-suspend user-delete authors applications application application-approve application-reject author author-payout data-requests data-request
Trust & support (C): reports report report-action report-review community channel rooms room claims claim appeals appeal automod support ticket help help-article
Money & royalties (D): revenue subscriptions subscription transactions transaction refunds refund credits pricing plan-edit promos promo-new royalties royalty-cycle royalty-release royalty-settings payouts payout-retry bank-accounts bank-account
System (E): campaigns campaign-new banners banner-edit emails email-template analytics analytics-growth analytics-reading exports team team-invite roles audit audit-entry config policies integrations account

---

# v2: Calm console rules (apply to every screen; these override anything above)
The user found v1 too noisy. Home is now "My tasks" (see `s-overview` in 10-access-overview.html) and Books follows the new pipeline (see `s-books`). Match their calm.

1. **Header.** `.band` now renders as a plain white header automatically (petals only on Home via `.band--home`, never use it elsewhere). Delete the `<p>` subtitle inside `.band__text`. `.band__acts` holds ONE primary button; secondary actions become icon buttons (`<a class="ib" aria-label="Export"><svg class="ico">…</svg></a>`) or move into the page. Same for `.ph__acts` on detail pages: one primary, at most one secondary, the rest into an `.ib` ⋯ (`#i-more`).
2. **Key numbers.** At most 4 `.kpi` per strip, only on landing/list pages. Detail pages: no kpi strip; put the 2–3 figures that matter in `.ph__meta` or a `.kv`.
3. **Filters.** Replace rows of `.dd` dropdowns with: search + one `<button class="fbtn"><svg class="ico"><use href="#i-filter"/></svg>Filters</button>`, plus at most 2 `.achip` active-filter chips (`<span class="achip">Plan: Quarterly<button aria-label="Remove filter"><svg class="ico"><use href="#i-x"/></svg></button></span>`). Keep at most ONE row of `.fchip` quick filters if it is the main way to slice the list.
4. **Tables.** At most 6 columns. Rows open with `data-go`. At most one button per row. Merge secondary columns into the `.who small` line.
5. **Status.** Pills (`.st`) only for exceptions: late, failed, urgent, high severity, needs action, held, pending review. Normal states (Active, Live, Paid, Successful, Verified, Working, Published, On time, Approved) become plain text: `<span class="st-plain">Active</span>` or just text.
6. **Explanations.** Delete info callouts (`.note.info`, `.note` / `.note.org` that only explain how something works) and explanatory paragraphs; move their content into the screen's `data-note` bullets. Keep `.note.warn` / `.note.err` only when they ask staff to act.
7. **Detail pages.** Main column + one slim side panel. History, audit timelines, version history, raw ids, webhook logs and other secondary panels go inside a fold:
   `<details class="fold"><summary>More details <small>history, ids</small></summary><div class="fold__b"> …panels' content (no nested .panel) … </div></details>`
8. **Budget.** Aim for at most 5 visible blocks per screen before scrolling. Remove anything shown twice.
9. **Never** delete screens, change ids, or break `data-go`/`data-base` targets. Other files link to them. Keep sample data and numbers consistent. Keep useful content; fold it rather than lose it.
10. New components available (00b-components.html, "Calm console components"): `.urgent`, `.tasks/.task`, `details.more`, `details.fold`, `.sline`, `.fbtn`, `.achip`, `.score` (+ `.meter`), `.st-plain`.

## v2: New book pipeline (author self-serve)
1. Author uploads Word (.docx, preferred) or EPUB in Author Studio; PDF allowed with a warning (slower, more likely sent back).
2. System processing (1–3 min, background job): convert to clean HTML, house style (quotes, scene breaks, strip fonts/colours, compress images), detect chapters, TOC, word count → length tier → price, 10% preview cut at a paragraph end, paragraph anchors, cover check, epubcheck, plagiarism similarity, content-policy scan. Output EPUB3 + book manifest.
3. Author confirms chapters and previews (first page, a middle page, preview cut) on a phone preview, fixes plain-language flags, submits.
4. Readiness score (weighted failed checks): ≥90% and no flags → Ready for review; otherwise → Needs fixes (staff fix only flagged spots).
5. Quick review (~5 min): automated results summary, 3 spot-check pages, cover on phone, metadata → Approve (now/schedule) or Send back (issue list auto-filled from flags, editable).
6. Fast lane: updates to a live book with under 2% of words changed, no new chapters, author in good standing → publish after automated checks, diff logged for spot audits.
Stages: Draft (author) → Processing → Needs fixes → Ready for review → Scheduled/Live; Sent back (author); Unpublished, Taken down, Rejected.
New screen id: `book-processing` (built by the catalogue builder). Home variants: `overview-publisher`, `overview-moderator`, `overview-finance`.

---

# v3: Flow UX pass (the user asked: "review all the admin flows and give them a good UX so things are not too complex")
Audit result: 209 dead controls (buttons that go nowhere), no feedback after actions, every queue works differently, jargon on the surface, long forms with everything shown at once. Fix with these shared patterns. They override earlier guidance where they conflict.

## New shared mechanics (already in 00b-components.html + 90-tail.html)
- **Toast + Undo**: add `data-toast="Message"` to any control (with or without `data-go`). Optional `data-undo="<screen id>"` adds an Undo link. Example: `<a class="btn btn-p" data-go="reports" data-toast="Message removed. @tobi_reads warned." data-undo="report">Remove</a>`. In-place actions with no navigation (Save, Copy, Resend, Mark read): just `data-toast`.
- **⋯ menu**: `<div class="mwrap"><button class="ib" data-menu aria-expanded="false" aria-label="More actions"><svg class="ico" aria-hidden="true"><use href="#i-more"/></svg></button><div class="menu" hidden><a data-go="…">Label</a><a data-toast="…">Label</a><hr><a class="danger" data-go="…">Delete…</a></div></div>`. Put it last in `.ph__acts` / `.band__acts`.
- **Decision bar**: on every queue-item detail screen, the final child of the `<section>` (after `.page`) is
  `<div class="decide"><div class="decide__q">Report <b>3 of 18</b> · <a class="link" data-go="reports">Back to queue</a></div><span class="grow"></span> …secondary btn-g… …primary btn-p… <a class="btn btn-q sm" data-go="<next item screen>">Skip <span class="kbd">J</span></a></div>`.
  Decisions move into this bar (remove duplicates from the header). Decisions end on the queue or the next item, always with a `data-toast` that says what happened and who was told.
- **All caught up**: `<div class="done"><b>All caught up</b><span>…</span><a class="btn btn-g">…</a></div>` for empty queues.

## Rules
1. **Zero dead controls.** Every `.btn`, `.ib`, `.link`, `.fbtn`, tab, chip and menu item must have `data-go`, `data-toast`, `data-menu`, `data-single`/`data-multi` parent behaviour, or be a `.switch`/`.cb`. If an action has no sensible destination, give it a `data-toast` ("Saved", "Copied", "Receipt sent to hauwa.musa@gmail.com"), or delete it if it isn't needed. Tabs that are cosmetic sit in a `data-single` parent.
2. **Reversible vs irreversible.** Reversible, low-risk actions (Keep, Hide, Mark fixed, Assign to me, Mute 24h, Pause, Archive) happen immediately with a toast + Undo, with no confirmation modal. Keep modals only for: money moving (refund, release, price change, grants over 500), permanent account actions (ban, delete), publishing/unpublishing a book, sending a push to many readers, and anything needing a reason that the affected person will see.
3. **One decision vocabulary.**
   - Books: Approve · Send back · Reject.
   - Applications: Approve · Ask for info · Reject.
   - Reports: Keep · Remove · Remove and act on user.
   - Claims: Uphold (take down) · Reject claim · Ask author.
   - Appeals: Uphold · Reduce · Overturn.
   - Refunds: Refund · Decline.
   - Bank accounts: Verify · Ask for document · Reject.
   - Support: Send · Send and solve.
   Primary (`btn-p`) = the most common safe outcome; destructive = `btn-d`.
4. **Plain words on the surface.** Staff-facing labels never show raw tech names first: "Store purchase events" not "RevenueCat INITIAL_PURCHASE", "File check" not "epubcheck", "Paragraph links kept" not "anchors", "Payment notice from Flutterwave" not "webhook". The tech names can stay inside a `details.fold` ("Technical details").
5. **Short forms.** Forms show only what most people change, with sensible defaults pre-filled. Everything else goes into `<details class="fold"><summary>More options <small>…</small></summary>…</details>`. Long create flows (campaign, promo, banner, book upload) read top-to-bottom in the order people think: what → who → when → review, with a live preview where it helps.
6. **Every action says who is affected.** Confirmation copy and toasts name the person and what they will receive ("Obiageli gets a push and an email").
7. **Keep consistency with v2 calm rules.** Do not reintroduce noise; don't add new panels just to hold new features.
8. Never delete screens or change ids. New overlay screens are allowed (add them to your own file) when an action genuinely needs input (for example `application-info` for "Ask for info").

# v4: Credits pricing (user decision, 16 Nov 2026)
Replaces the royalty pool and reading-hours split everywhere. Screen ids `royalties`, `royalty-cycle`, `royalty-release`, `royalty-settings` are kept; their labels are now "Author earnings".

## The model
- **Book price** = standard pages × ½ credit, rounded up to a whole credit. Standard page = 250 words; a full-page image = 1 page. Example: 62,400 words → 250 pages → 125 credits (₦375). No length tiers (no Short/Standard/Long/Epic).
- **1 credit = ₦3.** Readers choose **Pay upfront** (whole book, downloads offline) or **Pay as you read** (a chapter is charged when the reader moves past its first page; total never goes over the upfront price; re-reading free; reader undo within 10 minutes; Support can return a charge after that via `unlock-return`). Free preview: first 10%. Chapters over 20 pages, and books without chapters, are split into parts at processing.
- **Authors earn ₦1.60 per credit spent** on their books, tips and messages, closed monthly, paid on the 15th after a 30-day hold. Returned chapters and refunded unspent credits are not paid.
- **Plans** (in-app / web): Monthly ₦900 / ₦800 = 300 credits; Quarterly ₦2,400 / ₦2,100 = 800; Yearly ₦8,400 / ₦7,500 = 3,000 (includes 200 bonus). Per month: ₦900, ₦800, ₦700.
- **Top-ups** (subscribers only, ₦3 a credit): 200 ₦600, 500 ₦1,500, 1,000 ₦3,000. Top-up credits don't expire.
- **Rollover**: unused plan credits carry one period while subscribed, capped at one plan's worth. **Pause** 1 to 3 months instead of cancelling.
- **Guard**: every plan must net more than ₦1.60 per credit after the store fee. Yearly is tightest (₦2.38, ₦2.21 if VAT is withheld).

## Where it lives
- Settings → **Pricing rules** (`pricing-rules`, confirm overlay `pricing-rules-confirm`): every rule above, plus the plan check.
- Money → Plans and pricing (`pricing`): plans, top-ups, book price examples.
- Money → Revenue: KPIs are credits sold, credits spent, unspent credits (owed, deferred revenue), expired credits.
- Book Details / Pricing and access / Stats: price line, upfront vs pay-as-you-read split, average paid, author earnings.
- Reader → Credits: ledger shows chapter charges; `unlock-return` gives a chapter back.

## Words to use
"Author earnings" (not royalties or pool), "top-up" (not pack), "pay upfront" / "pay as you read", "standard page".
