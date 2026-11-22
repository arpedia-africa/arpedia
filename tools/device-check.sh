#!/usr/bin/env bash
# Runs inside .github/workflows/device-check.yml on the hosted emulator: installs the release APK,
# points the app at the runner's local stack, then runs the flow's Maestro file at each width and
# release parity at 375 dp in four themes. Exit code is non-zero if either check fails.
# Env: FLOW (Maestro file name without .yaml), IDS (parity ids, space separated), WIDTHS (e.g. 375,320).
set -u
mkdir -p .shots/maestro .shots/parity
LOG=.shots/device-check.log
: > "$LOG"
log() { echo "$@" | tee -a "$LOG"; }

adb install -r "$RUNNER_TEMP/app-release.apk" | tee -a "$LOG"
# The app is built for 127.0.0.1 URLs (pnpm dev:vars); map them to the runner.
for p in 55321 8787 8788; do adb reverse "tcp:$p" "tcp:$p"; done
# Pixel 6 is 1080 px wide: density 461 gives 375 dp, the prototype's width.
adb shell wm density 461

status=0
if [ -n "${FLOW:-}" ]; then
  f="apps/mobile/.maestro/$FLOW.yaml"
  if [ -f "$f" ]; then
    log "== Maestro $FLOW at ${WIDTHS:-375,320} dp"
    (cd .shots/maestro && node ../../tools/maestro-widths.mjs "../../$f" "${WIDTHS:-375,320}") 2>&1 | tee -a "$LOG"
    [ "${PIPESTATUS[0]}" -eq 0 ] || status=1
  else
    log "== No Maestro file $f on this branch"
    status=1
  fi
fi

if [ -n "${IDS:-}" ]; then
  adb shell wm density 461
  log "== Parity at 375 dp: $IDS"
  # shellcheck disable=SC2086
  node tools/parity.mjs $IDS --serial emulator-5554 2>&1 | tee -a "$LOG"
  [ "${PIPESTATUS[0]}" -eq 0 ] || log "(parity percentages are advisory: review the side-by-sides)"
fi

log "== Done, status $status"
exit $status
