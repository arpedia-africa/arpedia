# Design

Direction B: Vibrant, proud, African. Colors kept exactly from v25; hierarchy, type, shape and motifs are new.

## Color
| Token | Value | Use |
|---|---|---|
| `--org` | #F5931F | Primary fills: buttons, hero bands, active indicators |
| `--org-ink` | #9A4F00 | Orange text and links on white (6.1:1) |
| `--org-tint` | #FDEEDB | Secondary buttons, selected rows, pills |
| `--org-tint-2` | #FFF6EA | Soft panels |
| `--on-org` | #4A2600 | Text and icons on orange (warm sunflower-centre brown, 5.8:1, AA at every size). Replaced near-black, which read harsh. |
| `--night` | #1A1100 | Dark toolbars, live pills, strong buttons, admin sidebar |
| `--ink` | #111827 | Body text |
| `--ink-2` | #4B5563 | Secondary text |
| `--ink-3` | #6B7280 | Tertiary text, inactive icons |
| `--line` | #E5E7EB | Dividers, borders |
| `--surface` | #F3F4F6 | Inputs, chips, stat tiles |
| `--white` | #FFFFFF | App background |
| `--sun` / `--brown` / `--olive` | #F9C623 / #6B3F1D / #5F6B3A | Logo, petal pattern |
| `--mauve` / `--slate` | #8B5E83 / #263238 | Avatars, legacy accents |
| Success / Warn / Error / Info | #15803D / #B45309 / #B91C1C / #1D4ED8 | With tints #DCFCE7 / #FEF3C7 / #FEE2E2 / #DBEAFE |
| Live | #4ADE80 | Live-room dot only |
| Highlights | #FDE68A #BBF7D0 #BFDBFE #FBCFE8 | Yellow, green, blue, pink |
| Reader themes | Light #FFFFFF/#1D1A16 · Sepia #F6EBD9/#3B2F22 · Dark #14110D/#E8E0D4 | Page bg / text |

Rule: orange text is never #F5931F on white. Text on orange is always `--on-org` (#4A2600), never white (2.3:1 fails) and not near-black (too harsh).

## Typography
- Display: Bricolage Grotesque 800 (screen titles, hero lines, book titles, big numerals), 600 for section heads. Letter-spacing -0.02em.
- UI: Inter 400/500/600/700 for everything you tap or read in lists.
- Reading: Literata (book text, quotes, notes).
- Scale (px): 11 · 12 · 13 · 14 · 15 · 17 · 20 · 24 · 28 · 34. Rank numerals 84.

## App colour themes
Readers pick a colour during onboarding (`s-theme`, after genres) or later in Settings → App colour (`s-theme-settings`). The picker shows rounded colour squares with the name and feel inside, plus two dots for the accent and the star gold.

**The chosen colour is the main colour, not the only colour.**
- **Main colour** (`--org`, `--org-ink`, `--org-tint`, `--org-tint-2`, `--on-org`): hero bands, main buttons, selections, active tab, focus borders, sheet headers.
- **Accent colour** (`--acc`, with `--acc-on` for text on it): progress bars and rings, rank numbers, counts and unread dots, timelines. Each theme has its own accent.
- **Stars** (`--star`, #E8A600): always gold, in every theme.
- Book covers, highlights and reader page themes never change.
- **Never hard-code colours on the main colour.** Faded text on bands and sheet headers uses `rgba(var(--on-org-rgb), a)`. Sunflower petals use `rgba(var(--petal-rgb), calc(a * var(--petal-k)))`: yellow on Sunflower, tone-on-tone white on Palm and Plum, sunflower orange on Night. Yellow petals on green or purple turn olive and muddy. The small sun on light tiles (Unlock all) uses `--sun-rgb`, a soft colour that complements the theme: olive on Sunflower, muted gold on Palm and Plum, soft orange on Night.

| Theme | Main | Text on main | Accent | Feel |
|---|---|---|---|---|
| Sunflower (default) | #F5931F | #4A2600 (5.8:1) | Olive #5E7A35 (from the logo) | Bright orange with olive |
| Palm | #2F6B4F | #FFFFFF (6.3:1) | Warm orange #E8902A | Deep green with warm orange |
| Plum | #6B4A8E | #FFFFFF (7.0:1) | Marigold #E0A030 | Muted purple with marigold |
| Night | #2A211A | #FFF6EA (14.7:1) | Sunflower #F5931F | Warm black with sunflower |

Themes swap tokens on `.device[data-theme]`. Never hard-code the brand orange: use the tokens, or `rgba(var(--org-rgb), a)` for tints.

## Text fields
Resting: grey surface (`--surface`), no border. On focus (tap or keyboard): white background, 1.5px orange border, soft orange halo (`.field:focus-within`). This matches v25. Error: red border. Applies to every text box (onboarding, search, composer, author messages), and the same focus border is used in the admin console.

## Shape and space
- Radius: 8 chips-small, 12 inputs and buttons, 14 cards, 20 sheets, 999 pills.
- Spacing: 4-pt scale 4 8 12 16 20 24 32. Screen gutter 16.
- Touch targets ≥ 44px.

## Motifs
- Hero band: full-width orange top section on main tabs and book pages, sunflower petal conic pattern bleeding off one corner.
- Rank numerals: outlined Bricolage digits beside covers.
- Night pills: dark `--night` pills for live states, credits, current filters.

## Elevation and layers
- Sheet: 0 -12px 40px rgba(17,24,39,.18). Toolbar: 0 14px 30px -10px rgba(0,0,0,.5).
- z-index: content 0 · sticky 10 · tabbar 20 · backdrop 30 · sheet 40 · toast 50.

## Motion
Soft and quick, one vocabulary everywhere. Content is always visible; motion only enhances how it arrives. Source: `prototype/src/00c-motion.html`, `admin/src/00c-motion.html`.

| Token | App | Admin | Use |
|---|---|---|---|
| `--m-fast` | 120ms | 120ms | Press feedback, colour |
| `--m-base` | 200ms | 200ms | State changes: tabs, chips, toggles, focus, menus |
| `--m-slow` | 320ms | 280ms | Arrivals: screens, sheets, decision bar |
| `--m-fill` | 700ms | 600ms | Progress bars, meters, rings, chart columns |
| `--m-ease` | cubic-bezier(.22,1,.36,1) | same | Everything that arrives or responds (ease-out-quint, no bounce) |
| `--m-rise` | 8px | 6px | Travel distance for arrivals |
| `--m-stagger` | 45ms | 40ms | Gap between items in a list |

| Pattern | What moves |
|---|---|
| Arrive | When a screen opens, its sections rise in one after another (and in the admin, a queue item's decision bar). The orange band and the tab bar stay put. |
| Ripple | Rails, lists, suggestions and genre tiles: the first five to eight items cascade in. |
| Glide | Sheets slide up from the bottom; backdrops fade. |
| Press | Tappable things sink slightly: buttons and chips to 97%, icon buttons to 90%, rows to 99%, covers and tiles to 96%. |
| Select | Tab underlines grow from the centre; selected chips and options settle in; toggles slide. |
| Fill | Progress bars, meters and rings grow from zero when they appear. |
| Pop | Follow, like and save do a single small pop. |
| Drift | Sunflower petals on orange bands turn very slowly (about 140 seconds per turn), like a sun. |
| Shimmer | `.skel` loading placeholders. |

Reduced motion: no travel, scale or spin. Short fades stay so people keep their bearings.

## Components
Source of truth: `prototype/src/00b-components.html` (structure) on top of `prototype/src/00-head.html` (tokens and atoms). Screens use only these; no inline styles except data values (`--p` on rings, bar widths, chart heights, toolbar position).

| Component | Classes | Use |
|---|---|---|
| App bar | `.appbar` `--border` `__title` `__spacer` `.who` | Every secondary screen: back, centered title, one action |
| Page head | `.page-head` | Tab screens without a hero (Library) |
| Hero band | `.hero` `__bar` `__body` `__title` `__sub` `__tabs` `.hero-cover` `.hero-panel` `.hero-person` `--low` | Home, Community, Profile, Credits, Studio, book and author pages, celebrations |
| Section | `.section` `__head` `__title` `__link` `.group-label` | Every content block; 24px rhythm |
| Grouped list | `.group` `--flush` + `.cell` `__lead` `__body` `__title` `__sub` `__trail` `--tap` `--top` `--hl` | Settings, chats, books, history |
| Options | `.option-list` `.option` `.is-selected` `.radio` `.amounts` `.amount` | Plans, packs, tips, report reasons, recipients |
| Numbers | `.stats` `.stat` `.kv` `.ring` `.bar` | Book stats, balances, royalties, progress |
| Callout | `.callout--info/warn/ok/err/brand/quiet` | Inline guidance and warnings |
| Promo / live | `.promo` `.live` | Current plan, rooms intro, live clubs |
| Content | `.post` `.review` `.annot` `.quote` `.excerpt` `.timeline` | Posts, reviews, highlights, steps |
| Forms | `.form` `.steps` `.intro` `.input` `.field` `.divider-or` `.code-boxes` `.drop` | Sign-up, apply, submit, join code |
| Media | `.cv` sizes `.rail` `.bk` `.rank` `.cover-grid` `.avatar-tile` `.genre-grid` `.member` | Covers, rails, rankings, people |
| Atoms | `.btn-p/s/n/g` `.chip` `.pill` `.toggle` `.seg` `.tabs` `.av` `.empty` `.toast` | Everywhere |
| Type | `.t-display` `.t-h1` `.t-h2` `.t-h3` `.t-title` `.t-body` `.t-sm` `.t-xs` `.t-label` `.t-muted` `.t-soft` `.t-brand` `.t-reading` | All text |

## Icons
Myna UI icons (`@mynaui/icons` 0.4.2, MIT, github.com/praveenjuge/mynaui-icons), outline set: 24px grid, 1.5 stroke, round caps. They are inlined as one SVG sprite in `prototype/src/01-shell.html` with our own ids (`i-home`, `i-lib`…). Credits use Myna `database` (stacked coins) and achievements use `badge`. Brand marks stay custom: the sunflower logo, the app icon, Google and Apple.

**No icons inside cards, list rows, callouts, swatches or empty states.** Icons belong only on controls: buttons, tabs, chips, app-bar and tab-bar buttons, chevrons and input fields. The one exception is the Profile tab, which keeps its tinted icon tiles (`.ic-bub`) in My collection. User preference, 2026-11-12.

## Admin console (staff web app, `admin/`)
Same tokens, fonts and icons as the app. Calm by default, because staff work in it all day.
- **Home = My tasks** for the signed-in role: one urgent card, a task list (top 5, the rest under "Show more"), one health line and one line of today's numbers. Charts live in Revenue and Analytics.
- **Orange petal band only on Home and Sign in.** Every other page has a plain white header: the title, one primary action, and the rest behind icon buttons or ⋯.
- **Sidebar:** 10 sections (Home, Books, People, Safety, Support, Money, Payouts, Messages, Insights, Settings). Sub-pages show only for the open section. Counters appear only on queues that need the role, about 4 at most.
- **Pages:**
  - At most 4 key numbers, on landing pages only.
  - Search plus one Filters button, with active filters as removable chips.
  - Tables of 6 columns or fewer; rows open on click; at most one button per row.
- **Status pills only for exceptions** (late, failed, urgent, held). Normal states are plain text.
- **Explanations live in the screen notes, not on the page.** Warnings that need action stay.
- **Detail pages:** a main column plus a slim side panel. History, logs and raw ids fold into "More details".
- Builder contract: `admin/BRIEF.md`.
- **Flows:**
  - **No dead buttons.** Every action ends with a toast that says what happened and who was told; reversible actions add Undo.
  - **Confirmation pop-ups only when they are needed:** money moving, bans and deletion, publishing, pushes to many readers.
  - **Queue items have a sticky decision bar** with the position ("3 of 18"), Back to queue, the decisions, and Skip.
  - **One decision vocabulary per queue.** Approve · Send back · Reject; Keep · Remove · Remove and act; and so on.
  - **Secondary actions live in a ⋯ menu.**
  - **Forms put only common fields up front.** Everything else goes under "More options".
  - **Plain words on the surface.** Technical names go in "Technical details" folds.

## Logo
The real logo from arpedia.africa lives in `assets/brand/`:
- `logo.png` is the full lockup.
- `icon.png` is the 512px tile.
- `mark.png` is the tile with rounded transparent corners.
- `wordmark.png` is the serif "arpedia" on a transparent background.

The prototypes embed `mark.png` as the `i-appicon` symbol (`i-sun` points to it) and the wordmark as `.wmk`. Wordmark colour by surface:
- Original olive on white.
- `.wmk--night` (dark) on orange.
- `.wmk--light` (white) on dark.

Don't redraw the logo.
