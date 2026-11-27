# Agents

Codex and other agents: read [CLAUDE.md](CLAUDE.md) first. Its rules apply to you exactly as written (prototype parity, money, access, design, copy, checks).

## Working alongside the Claude builders
- State lives on GitHub. Before you start, read the open PRs labelled `fix`, their Next step, and any comment starting "Coordinator request".
- Branches: `codex/NN-<topic>` from `origin/main`, one PR per group, label `fix`. Claim a group by pushing its branch before you start; never take work another branch already claims.
- Never push to `fix/app-batch-*`, `flow/17-*` or another builder's branch.
- Rows to work on come from [docs/launch/SPEC-CHECK.md](docs/launch/SPEC-CHECK.md). Tick a row in the same PR that fixes it.
- Before marking ready: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`. pgTAP runs in CI (`database`). `merge-when-green` merges ready PRs.
- Never: read or print secrets, deploy, connect to staging, production or the old v25 project, upload to a store, edit `docs/prd/status.json`, merge by hand, weaken a test, edit a merged migration, or change a price, money rule or who can see private data.
