#!/usr/bin/env bash
# Validate the Android release lanes without building or uploading (flow 17 rule 13).
# Each lane runs with DRY_RUN=1: Play's track state comes from DRY_RUN_<TRACK> and the lane prints
# the supply call it would make. Run from apps/mobile:  bash fastlane/validate.sh
# (CI or any machine with Ruby; locally: docker run --rm -v "$PWD:/app" -w /app ruby:3.3 bash fastlane/validate.sh)
set -euo pipefail
command -v fastlane >/dev/null || gem install fastlane -N -v '~> 2.228' >/dev/null
export DRY_RUN=1 FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_HIDE_CHANGELOG=1 FASTLANE_DISABLE_COLORS=1 CI=1
fail=0
run() { # expect: ok|error, then lane and args
  local expect=$1; shift
  if out=$(env "${ENVS[@]}" fastlane android "$@" 2>&1); then got=ok; else got=error; fi
  if [ "$got" = "$expect" ]; then
    echo "PASS  $expect  ${ENVS[*]} $*"
    echo "$out" | grep -E "supply \{|gradle bundleRelease|Error|must|Nothing|already|starts" | sed 's/^/        /' | head -3
  else
    echo "FAIL  expected $expect, got $got: ${ENVS[*]} $*"; echo "$out" | tail -20; fail=1
  fi
}
fastlane lanes >/dev/null
ENVS=(DRY_RUN_INTERNAL=0);                                run ok internal
ENVS=(DRY_RUN_INTERNAL=0 VERSION_CODE=25);                run error internal
ENVS=(DRY_RUN_INTERNAL=27);                               run ok closed
ENVS=(DRY_RUN_INTERNAL=0);                                run error closed
ENVS=(DRY_RUN_INTERNAL=27 DRY_RUN_ALPHA=27);              run error closed
ENVS=(DRY_RUN_ALPHA=27 DRY_RUN_PRODUCTION=0);             run ok production percent:5
ENVS=(DRY_RUN_ALPHA=27 DRY_RUN_PRODUCTION=0);             run error production percent:20
ENVS=(DRY_RUN_ALPHA=27 DRY_RUN_PRODUCTION=27);            run ok production percent:20
ENVS=(DRY_RUN_ALPHA=27 DRY_RUN_PRODUCTION=27);            run ok production percent:100
ENVS=(DRY_RUN_ALPHA=27 DRY_RUN_PRODUCTION=27);            run error production percent:7
ENVS=(DRY_RUN_PRODUCTION=27);                             run ok halt
ENVS=(DRY_RUN_PRODUCTION=0);                              run error halt
exit $fail
