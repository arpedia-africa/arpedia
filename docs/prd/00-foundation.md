# Flow 00 · Foundation

**Build order:** first, alone (wave W1) · **Depends on:** nothing · **Prototype:** design system tab of the app prototype, `prototype/src/00-head.html`, `00b-components.html` and `00c-motion.html`; admin shell `admin/src/02-shell.html`

## Goal
Build the base every flow stands on, so later flows only add their own tables and screens:
- one repo
- two component kits
- the shared rules in code
- the base database
- the Worker skeletons
- CI with the gates

**Success looks like:** a fresh clone runs `pnpm i && pnpm dev`, then shows the kit gallery on an Android emulator and the admin shell in a browser. CI is green.

## Scope
### Repo
1. Initialise git. Create a pnpm workspace with the layout in [ARCHITECTURE.md](ARCHITECTURE.md#repo-layout). Use TypeScript strict everywhere, a shared ESLint and Prettier config, and Turborepo only to cache tasks.
2. Add `.env.example` per app. Secrets never go in the repo.
3. Fill in the Commands section of `CLAUDE.md`.

### `packages/core` (shared rules)
4. **Pricing:**
   - `standardPages(words, imagePages)` = ceil(words ÷ 250) + imagePages
   - `bookPrice(pages)` = ceil(pages ÷ 2)
   - `splitParts(chapters)` splits chapters over about 20 pages
   - `chapterPrices(bookPrice, chapterPages)` spreads the price so the parts sum exactly to the book price
   - Constants: `CREDIT_NAIRA` = 3, `AUTHOR_RATE` = 1.6, `PREVIEW` = 0.1, `UNDO_MIN` = 10
5. Zod schemas for shared shapes (book manifest, chapter, ledger reason enum).
6. **Vitest tests** for all of the above: rounding, sums, edge sizes.

### `packages/ui` (app kit, React Native)
7. **Scaling:** `s(n)` helper and `useScale()` hook: scale = min(1, max(0.85, windowWidth ÷ 375)). Every token size (font, spacing, radius, icon) goes through it. A `Text` wrapper whose `oneLine` prop sets `numberOfLines={1}` + `adjustsFontSizeToFit` (minimumFontScale 0.85) is used by Button, Chip, Tab, titles and stats. Vitest covers the scale function; the kit gallery has a width switcher (320 / 360 / 375).
7a. **Tokens from DESIGN.md:**
   - colours, with the four themes Sunflower, Palm, Plum and Night via a ThemeProvider, including `on-org`, `petal`, `sun` and `acc`
   - type scale: Bricolage Grotesque, Inter, Literata
   - spacing, radii, shadows
   - motion: the `m-*` durations and easings
   - reduced motion respected
8. **Components** (match the prototype; check with `node tools/screen.mjs --css`):

   | Group | Components |
   |---|---|
   | Layout | Screen (safe areas, status bar), HeroBand (petal pattern, drift), Section, Divider |
   | Navigation | TabBar, Header |
   | Actions | Button (primary, secondary, ghost, night), IconButton |
   | Forms | Field (focus border and halo), Toggle, Chip, Segmented |
   | Containers | Sheet (bottom sheet, glide), Card (soft, tap), Cell or list row, KeyValue |
   | Content | Cover, Avatar and AvatarStack, Pill, Count badge, Meter, Ring |
   | Feedback | Skeleton, Toast (with undo), EmptyState |

   Icons are Myna UI via a single `Icon` component.
9. **Kit gallery screen** in the app (dev builds only) that renders every component in all four themes.

### `apps/mobile`
10. Expo SDK (latest) with Expo Router, using **Continuous Native Generation** (`expo prebuild`); no EAS. Builds and releases use **fastlane** on GitHub Actions:
    - **Android:** gradle → Play internal track (`supply`), signed with the v25 upload key.
    - **iOS:** `match` + `gym` → TestFlight (`pilot`), once the Apple account is added.
    - **Android** keeps the v25 package **`com.arpedia.reader`**, so it ships as an update. **iOS** is a new app, **`africa.arpedia.reader`**, in the partner's Apple team.
    - **Start from the v25 fastlane setup** in `C:\Users\PC\projects\Arpedia\mobile`: `fastlane/Fastfile` (iOS lanes `prebuild`, `beta`, `upload`, `release`), `android/fastlane/Fastfile` (lane `build`) and the `Gemfile`. Adapt them to `expo prebuild` and the new names. Signing env vars are `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`, not v25's reuse of `MATCH_PASSWORD`. iOS uses `match` with the partner team (`APPLE_TEAM_ID`) and our `arpedia/certificates` repo.
11. **Providers:** ThemeProvider, TanStack Query (with persistence), Supabase client (session in secure storage), Sentry, PostHog (feature flags).
12. Route groups ready for flows, and an offline banner.

### `apps/admin`
13. Next.js (App Router) on Vercel (team Arpedia, preview deploy per PR). shadcn/ui themed with Arpedia tokens, TanStack Table. Shell with the 10-section sidebar from the admin prototype, top bar and command palette.
14. Staff sign-in using Supabase Auth. The staff role is checked server-side, and pages are blocked for non-staff. Two-step sign-in comes in flow 16.

### `supabase/`
15. Supabase CLI project. The base migration holds the shared core tables from [README.md](README.md#core-data-model-shared-by-all-flows):
    - `profiles`, `staff_roles`, `audit_log`
    - `books`, `book_revisions`, `chapters`
    - `credit_ledger` (append-only: inserts only through functions; no update or delete grants)
    - `entitlements`
    - each with RLS
16. **Helper SQL functions:** `is_staff(role)`, `write_audit(...)`, `credit_balance(user)` (derived from the ledger).
17. **Seed** mirroring the prototype: Ngozi (reader), Ifeoma (author), Harmattan Letters and 7 other books with chapters and prices, one staff user per role.
18. pgTAP tests:
    - the ledger rejects update and delete
    - RLS blocks reading another user's ledger
    - `credit_balance` sums correctly

### `workers/`
19. **`workers/api`:** Hono on Cloudflare Workers.
    - Supabase JWT verification middleware (JWKS)
    - service-role Postgres client
    - R2 binding
    - health route
    - route registry so each flow adds one line
20. **`workers/chat`:** Durable Object class skeleton with WebSocket Hibernation and JWT check. Flow 06 fills it in.
21. Wrangler config for local, staging and production.

### `tools/`
22. Keep `tools/screen.mjs`. Add an empty `tools/desk` package (flow 12 fills it in).

### CI and gates
23. **GitHub Actions on pull requests:**
    - install, typecheck, lint
    - Vitest
    - Supabase start, migrations, seed and pgTAP
    - Maestro on an Android emulator: a smoke test that opens the kit gallery
24. Branch protection on `main`: gates must pass.

## Done when
- [ ] Fresh clone: `pnpm i`, `pnpm db:reset`, `pnpm dev` work on Windows and in CI.
- [ ] Kit gallery shows every component in all four themes on an Android emulator; reduced motion stops drift and stagger.
- [ ] At 320dp every kit component scales down and no button, chip, tab or title wraps to two lines at the default font size.
- [ ] Admin shell loads; a non-staff account is refused; a seeded staff account signs in.
- [ ] `credit_ledger` cannot be updated or deleted by anyone (pgTAP).
- [ ] Pricing functions pass their Vitest tests, including 250 pages = 125 credits and chapter prices summing exactly.
- [ ] `workers/api` health route answers locally and on staging with a valid JWT.
- [ ] CI runs all gates on a pull request.

## Not in this flow
Any product screen. Payments, the reader, the chat logic and two-step sign-in all belong to their own flows.

## Open questions
- GitHub organisation and repo name, and who has access.
- Supabase, Cloudflare, Sentry, PostHog, RevenueCat and Flutterwave accounts: who owns them and how they're billed.
- ~~App ids and the upload keystore~~ **Decided:** Android `com.arpedia.reader` (keystore copied into the secrets folder), iOS `africa.arpedia.reader` (partner's Apple team).
