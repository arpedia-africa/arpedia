# Build plan

How we build all 16 flows quickly, with background agents in parallel where the work allows. Read with [BUILD.md](BUILD.md) (the loop for one flow) and [ARCHITECTURE.md](ARCHITECTURE.md).

Flows are named by their file number (`03` = [03-book-page-unlock.md](03-book-page-unlock.md)). Two flows are new:
- **`00` Foundation:** repo, component kits, base schema, Workers skeleton, CI.
- **`17` Migration and launch:**
  - v25 data import and rehearsal, then beta.
  - **Play:** release as an update to `com.arpedia.reader`.
  - **iOS:** first App Store release of `africa.arpedia.reader`.
  - **Old iOS app:** email v25 iOS subscribers about the new app, and stop new sales in the old app (done by whoever holds the old Apple account).

## Principles
1. **Foundation first, alone.** Nothing runs in parallel until `00` is merged.
2. **At most 3 flows at once:** one in the foreground (critical path), two in the background, each in its own git worktree.
3. **Each agent owns its own files.** No two running flows edit the same files (see Ownership).
4. **Nothing merges without passing the gates.** The checks are automatic; a person checks each flow once on a real phone.
5. **One fresh, short session per flow.** Agents read only CLAUDE.md, their flow file, the Data and Server sections of flows they depend on, and the prototype screens they build (via `tools/screen`).

## Dependencies
```
00 Foundation
 ├─ 01 Sign-in (+16 pass 1: staff sign-in, roles) ─┬─ 02 Discovery
 │                                                 ├─ 10 Profile and settings
 │                                                 └─ 15 Engage and insights
 └─ 12 Book pipeline ─┬─ 03 Book page and unlock ─┬─ 04 Reading ── 05 Library
                      │                           └─ 09 Credits and plans ── 13 Earnings and payouts
                      └─ 11 Author Studio
 06 Community (chat Durable Object) ─┬─ 07 Reading rooms
                                     ├─ 08 Authors (also needs 09)
                                     └─ 14 Trust and support (also needs 12)
 16 pass 2 (all admin settings) and 17 Migration and launch come last
```
**The critical path is 00 → 12 → 03 → 04 → 05**, so the foreground always works on it.

> Order change from README: **06 Community comes before 08 Authors**, because messaging an author runs on the chat Durable Object built in 06.

## Waves
| Wave | Foreground (critical path) | Background agent 1 | Background agent 2 | Ends with |
|---|---|---|---|---|
| **W0** | CLAUDE.md, `tools/screen`, this plan | — | — | ✅ done |
| **W1** | `00` Foundation (Opus, 2 sessions) | — | — | Repo builds, kits render, CI green |
| **W2** | `01` Sign-in + `16` pass 1 (Sonnet) | `12` Book pipeline: Worker, queues, desk CLI, admin books (Opus) | — | Can sign in; a test book goes from upload to Live |
| **W3** | `03` Book page and unlock (Opus) | `02` Discovery (Sonnet) | `11` Author Studio (Sonnet) | Can find, preview and unlock a book |
| **W4** | `04` Reading (Opus, 2 sessions) | `09` Credits and plans (Opus) | `10` Profile and settings (Sonnet) | Can read, pay per chapter, subscribe |
| **W5** | `05` Library (Sonnet) | `13` Earnings and payouts (Opus) | `06` Community + chat Durable Object (Opus for the Durable Object, Sonnet for screens) | Full reading loop; authors get paid |
| **W6** | `14` Trust and support (Sonnet) | `07` Reading rooms (Sonnet) | `08` Authors (Sonnet) | Social layer complete and moderated |
| **W7** | `17` Migration rehearsal (Opus) | `15` Engage and insights (Sonnet) | `16` pass 2 admin settings (Sonnet) | Everything built; v25 import rehearsed on staging |
| **W8** | `17` Closed beta, fixes, Play release | Fix agents as needed | — | Launch |

**Before a wave starts:** the ★ questions in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) for its flows are answered or their defaults accepted.
- **Before W2:** Q88–92
- **Before W3:** Q47, Q62, Q63
- **Before W4:** Q9, Q54, Q55
- **Before W5:** Q5, Q26
- **Before W6:** Q1, Q2

## Models
| Model | Flows | Why |
|---|---|---|
| **Opus** | 00, 03, 04, 09, 12, 13, the chat Durable Object in 06, 17 | Money, encryption, reader positions, data migration: mistakes are expensive |
| **Sonnet** | 01, 02, 05, 06 screens, 07, 08, 10, 11, 14, 15, 16 | Screens, lists, forms, admin tables |
| **Haiku** | Copy fixes, renames, seed data, small follow-ups | Mechanical work |

## Ownership (prevents merge conflicts)
Each flow creates and edits only its own files:
- **Database:** `supabase/migrations/<timestamp>_<flow>_<name>.sql` and `supabase/tests/<flow>_*.sql`. Never edit another flow's migration; add a new one.
- **App:** `apps/mobile/app/(<flow-area>)/…` and `apps/mobile/features/<flow>/…`
- **Admin:** `apps/admin/app/(console)/<area>/…`
- **Workers:** `workers/api/src/routes/<flow>/…`, registered with one line in the router
- **Shared kits** (`packages/ui`, `packages/core`): **add new files only** in the background. Changing an existing component or token happens in the foreground, or as a tiny separate PR merged first.
- **Generated types** (`supabase gen types`) are regenerated by the coordinator after each merge, never committed by background agents.

## Gates (every branch, before merge)
Automatic, run by CI on the branch:
1. Install, typecheck and lint pass.
2. Migrations apply cleanly to a fresh database, and seed loads.
3. The flow's unit tests (Vitest) and SQL tests (pgTAP) pass.
4. The flow's Maestro happy path passes on the owner's phone at 320, 360 and 375dp (run by the builder before the PR is marked ready; GitHub runs it on an emulator nightly on main).
5. **Visual check:** side-by-side images of every screen in the flow (`node tools/parity.mjs`, four themes, on the owner's phone) in the PR, every visible difference fixed, 320dp and 360dp checked (no single-line text wraps, nothing clips). The owner reviews the screens; the percentage is advisory, not a merge gate.
6. `/code-review` (medium) shows no correctness findings left open.

Then the coordinator merges, regenerates types and ticks the status in [README.md](README.md).

**Human check, once per flow:** on a real low-end Android phone, against staging:
- the main path works
- all four themes look right
- large text and offline both work

Findings become a small follow-up task for a Haiku or Sonnet agent.

## How a wave runs
1. **Coordinator session** (the foreground; you plus Claude) starts the wave.
2. **Background agents** start, each in its own worktree on branch `flow/<NN>-<name>`, with the kickoff prompt below.
3. When an agent finishes, it runs the gates itself. On failure it gets **one** fix attempt, then reports.
4. **A light `/loop`** (every 20–30 minutes) watches CI on open branches only: it merges branches that pass every gate and sends failures back to their agent. Agents notify on completion, so nothing polls in between.
5. **The wave closes** when all its flows are merged and phone-checked.

Starting several agents needs your explicit go-ahead. Say **"use a workflow"** at the start of W2 and the coordinator runs each wave as a workflow script: start the agents, wait, check the gates, report.

## Kickoff prompt (same for every flow)
```
Build flow NN from docs/prd/NN-<name>.md.
Read: CLAUDE.md, docs/prd/BUILD.md, your flow file, and only the Data and Server
sections of the flows listed under "Depends on".
Prototype screens: run `node tools/screen.mjs <ids from the flow's Screens table>`.
Rules: stay inside your ownership paths (docs/prd/BUILD-PLAN.md#ownership);
migration first, then Workers, then app and admin screens from the kits;
only the tests BUILD.md allows. Checkpoint after every step (commit + push +
update the PR's Progress / Next step / Notes) so another account can continue
if this one stops. Run the gates. Do not merge.
Report in 15 lines or fewer: what shipped, gate results, anything left open.
```

## Token budget habits
- **Fresh session per flow:** never continue a flow in a long session.
- **Read screens with `tools/screen`, not the prototype source files.** A screen is about 1–3k tokens; a prototype source file is over 100k.
- **Agents report in 15 lines or fewer.** The coordinator never reads agent transcripts.
- **Screenshots** only for the final phone check, not while building.
- **Fix agents get the finding and the file path only,** not the whole flow.

## Expected effort
| Wave | Sessions | Parallel blocks |
|---|---|---|
| W1 | 2 | 2 |
| W2–W7 | about 20 | 6–8 |
| W8 | 2–4 | 2–3 |
| **Total** | **about 26** | **about 11–13 blocks** |

Compared with building one flow after another, about half the calendar time for 10–15% more tokens.
