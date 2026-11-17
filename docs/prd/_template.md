# Flow N · Name

**Build order:** N · **Depends on:** flows … · **Prototype:** app screens `s-…`, admin screens `…`

## Goal
One or two sentences: what the user can do when this flow ships, and why it matters.

**Success looks like:** one or two measurable signals (e.g. "70% of new sign-ups reach Home in under 2 minutes").

## Screens
| Screen | Prototype id | Purpose |
|---|---|---|
| … | `s-…` | … |

## Behaviour
Numbered rules, grouped by screen or step. Each rule is testable. Keep v25 behaviour that users rely on and say so ("Same as v25"). Mark new behaviour "New".

1. …

## States and edge cases
- **Empty:** …
- **Loading:** …
- **Error:** …
- **Offline:** …
- **Edge cases:** …

## Data
Tables and columns added or changed, with types. RLS rules in plain words. Migration notes from v25.

## Server
RPC functions, Edge Functions, triggers, queues, webhooks. For each: input, output, who can call it, what it checks.

## Admin side
Admin screens this flow needs (prototype ids) and what staff can do there.

## Analytics
Event names and key properties.

## Done when
- [ ] Checklist of observable outcomes on a real device against staging.
- [ ] Tests from BUILD.md that apply to this flow (name them).

## Not in this flow
What is deliberately left for later.

## Open questions
Decisions needed before or during the build.
