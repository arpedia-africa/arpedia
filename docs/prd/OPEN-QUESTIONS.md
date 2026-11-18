# Open questions

Every question raised while writing the flow files, each with the default we build on if you don't answer. Reply by number, for example "Q4: 8 characters, Q31: no". Anything unanswered ships with its default. **Status 17 Nov 2026:** Q1 answered (16+); every other question uses its default.

**★ = answer before its flow is built** (legal, money or hard to change later).

## Legal and privacy
| # | Question | Default | Flow |
|---|---|---|---|
| 1 ✅ | Minimum age | **Answered: 16+ only.** 16–17 year olds still get the Q2 protections | 01 |
| 2 ★ | Rules for readers aged 16–17 (direct messages, public rooms, marketing pushes) | No DMs with adults they don't follow, no public "Anyone" rooms, no marketing pushes | 06, 07, 15 |
| 3 ★ | Account deletion timing (the app says "can't be undone", the admin offers a 30-day grace) | Deleted immediately, data erased within 7 days | 10 |
| 4 | Self-serve data export for readers | Yes, from Settings, emailed as a file | 10 |
| 5 ★ | Tax withholding on author payouts, TIN collection, who files | 0% for individuals, configurable rate for companies, collect TIN optionally | 13 |
| 6 | Who contacts police about credible threats, and how long those logs are kept | Super admin only, logs kept 2 years | 14 |
| 7 | Sign-up says "this email already has an account" (reveals accounts) | Keep it; better than confused users | 01 |
| 8 | "Offers and news" notifications on by default | Off until the reader opts in | 10, 15 |

## Money and credits
| # | Question | Default | Flow |
|---|---|---|---|
| 9 ★ | Confirm Google Play policy allows our credits, top-ups and "cheaper on the web" note | Check with Play policy before flow 6; drop the web-price note in-app if needed | 09 |
| 10 | Upgrading plan mid-period | Takes effect at next renewal | 09 |
| 11 | Can a paused reader spend credits they already have | Yes; expiry clock frozen during pause | 09 |
| 12 | Can someone without a plan spend leftover credits | Yes | 03 |
| 13 | Web refund after some credits were spent | Books stay; only unspent credits are removed | 09 |
| 14 | v25 credit balances after migration | Moved into a top-up bucket that never expires | 09 |
| 15 | Promo codes: where readers enter them | A field on the Credits screen | 09 |
| 16 | Google Play grace period for failed renewals | Play default (up to 7 days), credits not refilled until paid | 09 |
| 17 | Web renewals | Flutterwave Payment Plans | 09 |
| 18 | Undo a chapter charge after reading a lot of it | Refused once more than 20% of the chapter is read | 04 |
| 19 | Gifting a book to someone who already paid for some chapters | Blocked, with a message | 03 |
| 20 | Daily cap on tips | No cap; presets 20 / 50 / 100 credits | 03 |
| 21 | Unpublishing with "Remove access" | Refunds credits paid for that book and reverses the author's earnings | 12 |
| 22 | Very short books (under about 10 pages) | Free to read, gift-only | 12 |
| 23 | Credit value editable in admin | Locked at ₦3 (Play prices are fixed) | 16 |
| 24 | Changing the author rate forces a new author agreement | Yes | 16 |
| 25 | Approval needed to save pricing rules | Step-up code for rules; a second person for plan prices | 16 |

## Authors and payouts
| # | Question | Default | Flow |
|---|---|---|---|
| 26 ★ | When does October get paid (prototypes disagree) | 30-day hold after month end, so October pays 15 Dec | 13 |
| 27 | Tips pay the author ₦1.60 a credit like everything else | Yes | 13 |
| 28 | Who pays Flutterwave transfer fees | Arpedia | 13 |
| 29 | Pay part of a run when the Flutterwave balance is short | Yes, the rest waits | 13 |
| 30 | Earnings on a book under a copyright claim | Paid up to the claim date, frozen after until decided | 13 |
| 31 | Chargeback after the author was paid | Arpedia absorbs it | 13 |
| 32 | Refunded top-up whose credits were partly spent | No claw-back from the author | 13 |
| 33 | Author statements | PDF in Author Studio after each payout | 11, 13 |
| 34 | Show v25 royalty history to authors | Totals only | 13 |
| 35 | Application asks for date of birth and state (admin shows them; app doesn't) | Add both to step 1 | 11 |
| 36 | Bank details collected when | After approval, before first payout | 11 |
| 37 | Promised application review time (app says 3 days, admin 5) | 5 working days | 11 |
| 38 | Writing sample files | .docx or .pdf, up to 5 MB | 11 |
| 39 | Plagiarism check provider and cost | Pick before flow 3; if it's down, skip without blocking | 11, 12 |
| 40 | Can an author delete a book | No, only unpublish | 11 |
| 41 | Studio stat: "minutes read" or "reads" | Reads (people) and credits earned | 11 |
| 42 | Message an author with 0 credits | Not allowed; prompt to top up | 08 |
| 43 | Refund the 5 credits if the author never replies | No | 08 |
| 44 | Following an author auto-joins their community | No | 08 |
| 45 | Authors see who follows them | Counts only | 08 |
| 46 | Authors message a reader first | No | 08 |

## Books and reading
| # | Question | Default | Flow |
|---|---|---|---|
| 47 ★ | Accept PDF manuscripts at launch (they go to the staff desk, slower) | Yes, with a "slower" warning | 12 |
| 48 | Staff desk promise to authors and who owns it | 2 working days; Publisher on duty | 12 |
| 49 | Fast lane for book updates | Under 2% of words changed, no new chapters | 12 |
| 50 | Which books skip straight to Quick review | Readiness 90%+ with no blocking flags | 12 |
| 51 | Count acknowledgements and "About the author" in pages | Yes; front matter (copyright, contents) excluded | 12 |
| 52 | Content-policy check provider | An adapter over a moderation model; hits block publishing | 12 |
| 53 | epubcheck in CI over test books | Yes | 12 |
| 54 ★ | Block screenshots in the reader (Android secure flag) | Yes for paid chapters, allowed in the free preview | 04 |
| 55 | Offline licence, device limit, locked-chapter peek | 7 days, 3 devices, 300 words | 04 |
| 56 | Lapsed subscribers and owned books | Keep reading online; offline copies stop refreshing after 7 days | 04 |
| 57 | Ask before downloading on mobile data | Yes, with "don't ask again" | 04 |
| 58 | Bookmark control (missing in prototype) | Button in reader controls, list under Chapters › Bookmarks | 04 |
| 59 | Highlight colours (toolbar shows 3, settings lists 6) | All 6 | 04 |
| 60 | Spoilers in discussion | Hidden by paragraph position; no extra "hide until" option | 04 |
| 61 | Reader fonts (Georgia can't be bundled) | Literata, an open Georgia-style serif, Inter, OpenDyslexic | 04 |
| 62 | Who can write a review | Readers who reached 95% | 03 |
| 63 | Who can override a book's price | Super admin and Finance | 03 |

## Discovery and library
| # | Question | Default | Flow |
|---|---|---|---|
| 64 | One genre list for app, Explore and admin | Yes, admin list is the source | 02 |
| 65 | "Most read" definition and Top 10 refresh | Distinct readers in 7 days, refreshed hourly | 02 |
| 66 | Recommendations | 60% interests, 40% popularity, co-finish for "Readers also loved" | 02, 03 |
| 67 | Coming soon rail on Home | After Top 10, hidden when empty | 02 |
| 68 | What search looks inside | Titles, authors, descriptions, and the free preview text only | 02 |
| 69 | Book requests: tell readers when declined | No; tell them when added | 02 |
| 70 | Library search | Filters your own books on the device | 05 |
| 71 | Re-reading a finished book moves it back to Reading | No | 05 |
| 72 | Owned but unopened books | Show in Saved | 05 |
| 73 | "Books this year" | Calendar year (Africa/Lagos) | 05, 10 |

## Community and reading rooms
| # | Question | Default | Flow |
|---|---|---|---|
| 74 | Can readers create clubs | Staff and authors only at launch | 06 |
| 75 | Reactions | Six fixed emoji | 06 |
| 76 | "Seen" receipts | Direct messages only | 06 |
| 77 | Arpedia Support thread | Read-only, with a Contact support button | 06 |
| 78 | Deleted message text kept for reports | 30 days | 06 |
| 79 | Typing indicators | Off | 06 |
| 80 | Report response promise | 24 hours for serious reports, 3 days for others | 06, 14 |
| 81 | Scheduled reading rooms (start date missing from create screen) | Add an optional start date | 07 |
| 82 | Room limits | 100 members per room, 20 rooms per person, auto-end after 30 quiet days | 07 |
| 83 | "Anyone can join" rooms appear in Discover | Yes | 07 |
| 84 | Who can report | Accounts older than 24 hours; mass reports flagged | 14 |
| 85 | In-app support form (prototype only has email) | Add a simple form that opens a ticket | 14 |
| 86 | Image moderation provider | Google SafeSearch from a Worker | 14 |
| 87 | Support credit grant limits | Support 200, Operations 500, more needs approval | 14 |

## Sign-in, profile and admin
| # | Question | Default | Flow |
|---|---|---|---|
| 88 | Minimum password length (prototype says 6) | 8 | 01 |
| 89 | Email verification | Not required to read; required to buy | 01 |
| 90 | Paywall rating and quote (placeholder numbers) | Hidden until real numbers and a consented quote exist | 01 |
| 91 | Forgot-password screen (not in prototype) | A sheet; design it in flow 1 | 01 |
| 92 | When to ask for notification permission | On "Go to Home" | 01 |
| 93 | "Invite friends, you both get 50 credits" | Share link only at launch, no reward | 10 |
| 94 | Device limit counts | Only devices with downloads | 10 |
| 95 | Launch with one Super admin | Allowed, with a warning | 16 |
| 96 | Feature flags | Supabase table for config; PostHog only to dark-launch flows | 16 |
| 97 | Quiet hours | Reader's setting (22:00–06:00) and staff rule (22:00–07:00) both apply | 15 |
| 98 | Second reviewer for big campaigns | Above 10,000 readers | 15 |
| 99 | Reading reminder pushes | Add to the automatic list, off by default | 15 |
| 100 | Install numbers source | Play Console export | 15 |
| 101 ★ | iOS under a partner's Apple account: how Apple's payouts for iOS sales reach Arpedia, and whose name shows as seller | Written agreement with the partner before the first iOS release | 09, 17 |
