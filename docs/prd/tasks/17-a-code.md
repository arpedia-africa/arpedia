Flow 17 is split between two builders. You are builder A (code, no test device). Work only on branch `flow/17-launch` and its PR (label `flow-17`).

Build everything in docs/prd/17-launch.md except rules 10 and 11 (the Maestro journeys and the money check after them) and the on-device part of rule 2. Builder B does those on branch `flow/17-journeys`; never touch that branch or its PR.

- Order: migration and RLS, api Worker store events, `launch_check()` and the pgTAP access sweep (rule 12), `tools/launch/*`, nightly backup with a tested local restore, fastlane lanes, `docs/launch/RUNBOOK.md` and `STORE-CHECKLIST.md`.
- Security sweep: if it finds a table or function open to the wrong role, fix it in your migration and list every one in the PR.
- Local and staging only. Never read `secrets.env`, connect to production or v25, upload to Play, deploy, or start a rollout. Validate fastlane lanes without uploading.
- Use the second database only (`tools/db2.mjs`, `db2.lock`).
- v25 install check: no APK, so write it in the RUNBOOK as an owner step. App code that clears v25's old local data on first start (rule 2) is yours; B tests it.
- When your items in "Done when" pass locally, run `/code-review`, mark the PR ready and stop. Don't add `needs-phone`.
- When your PR is merged, print NOTHING-TO-DO.
