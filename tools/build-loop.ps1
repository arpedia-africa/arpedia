# Arpedia builder loop: runs the Claude CLI headless, one flow step-run at a time, until stopped.
# Usage (in a normal PowerShell window):
#   powershell -ExecutionPolicy Bypass -File tools\build-loop.ps1
#   powershell -ExecutionPolicy Bypass -File tools\build-loop.ps1 -Model claude-sonnet-5-5 -IdleMinutes 20
# Stop any time with Ctrl+C. Progress is always on GitHub, so you can restart, or switch Claude
# accounts (claude /login) and restart, and it continues where it stopped.
param(
  [string]$Model = 'claude-opus-5-5',
  [int]$IdleMinutes = 15,          # wait when there is nothing to do
  [int]$BetweenRunsSeconds = 30,   # short pause between productive runs
  [int]$CiWaitMinutes = 8,         # pause when a run is waiting on CI or pushed nothing
  [string]$WorkDir = "$env:USERPROFILE\projects\arpedia-builder",
  [string]$Repo = 'arpedia-africa/arpedia',
  [string]$Topic = '',             # ntfy topic: each run's final report is pushed to your phone
  [string]$Lane = '',              # e.g. L2-product, or 'L1-critical,L3-money-ops': only those lanes (one loop per lane set)
  [string]$Flows = '',             # e.g. '06' or '06,10': only these flows (one extra loop per flow when several are ready)
  [string]$TaskFile = '',          # file in the repo with extra instructions, e.g. to split one flow between two builders
  [string]$LockOwner = '',         # owner name this builder writes in its locks, so the loop can clear them
  [switch]$NoPhone,                # builder that never uses the phone: hands on-device checks back (label needs-phone)
  [switch]$Prep,                   # code-only builder: keeps needs-phone PRs merged with main and green, so device runs never wait on code work
  [switch]$PhoneOnly,              # device builder: only finishes on-device steps of needs-phone PRs
  [string]$Device = 'emulator-5554' # with -PhoneOnly: the device this builder owns (one loop per device; c1212d5c = owner phone)
)
if ($Flows -and -not $PSBoundParameters.ContainsKey('WorkDir')) { $WorkDir = "$env:USERPROFILE\projects\arpedia-builder-f" + ($Flows -replace '\W','-') }
elseif ($Lane -and -not $PSBoundParameters.ContainsKey('WorkDir')) { $WorkDir = "$env:USERPROFILE\projects\arpedia-builder-$Lane" }
if ($PhoneOnly -and -not $PSBoundParameters.ContainsKey('WorkDir')) { $WorkDir = "$env:USERPROFILE\projects\arpedia-builder-phone" }
if ($NoPhone -and -not $Lane -and -not $PSBoundParameters.ContainsKey('WorkDir')) { $WorkDir = "$env:USERPROFILE\projects\arpedia-builder-nophone" }
$ErrorActionPreference = 'Continue'
$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = '0'   # long Maestro/gradle runs must not be cut off after 10 min
$LockDir = "$env:USERPROFILE\projects\arpedia-locks"   # phone and database locks shared by builders on this PC
New-Item -ItemType Directory -Force $LockDir | Out-Null

# Build in a separate clone so your own working copy is never touched.
if (-not (Test-Path "$WorkDir\.git")) {
  Write-Host "Cloning $Repo into $WorkDir ..."
  gh repo clone $Repo $WorkDir
}
Set-Location $WorkDir

$allowed = @(
  'Read','Write','Edit','Glob','Grep',
  'Bash(git:*)','Bash(gh:*)','Bash(node:*)','Bash(npm:*)','Bash(npx:*)','Bash(pnpm:*)','Bash(corepack:*)',
  'Bash(supabase:*)','Bash(docker:*)','Bash(wrangler:*)','Bash(maestro:*)','Bash(adb:*)','Bash(emulator:*)',
  'Bash(bundle:*)','Bash(fastlane:*)','Bash(java:*)','Bash(./gradlew:*)','Bash(gradlew:*)',
  'Bash(ls:*)','Bash(cat:*)','Bash(head:*)','Bash(tail:*)','Bash(grep:*)','Bash(find:*)','Bash(mkdir:*)',
  'Bash(cp:*)','Bash(mv:*)','Bash(rm:*)','Bash(touch:*)','Bash(echo:*)','Bash(sed:*)','Bash(jq:*)','Bash(curl:*)',
  # Some models reach for the PowerShell tool on Windows: allow the same commands there.
  'PowerShell(git:*)','PowerShell(gh:*)','PowerShell(node:*)','PowerShell(npx:*)','PowerShell(pnpm:*)',
  'PowerShell(supabase:*)','PowerShell(docker:*)','PowerShell(adb:*)','PowerShell(maestro:*)',
  'PowerShell(New-Item:*)','PowerShell(Remove-Item:*)','PowerShell(Get-ChildItem:*)','PowerShell(Get-Content:*)',
  'PowerShell(Test-Path:*)','PowerShell(Set-Content:*)','PowerShell(Copy-Item:*)','PowerShell(Select-String:*)'
)

function Test-Online {
  try { $c = New-Object Net.Sockets.TcpClient; $ok = $c.ConnectAsync('api.anthropic.com', 443).Wait(5000); $c.Close(); return $ok } catch { return $false }
}

# The lock folders this loop's builder owns (each lock holds an "owner" file).
$owner = if ($PhoneOnly) { "dev-$Device" } elseif ($Prep) { 'prep' } else { $LockOwner }
function Get-OwnLocks {
  if (-not $owner) { return }
  Get-ChildItem $LockDir -Directory -ErrorAction SilentlyContinue | Where-Object {
    $o = Join-Path $_.FullName 'owner'; (Test-Path $o) -and ((Get-Content $o -Raw).Trim() -eq $owner)
  }
}

$run = 0
$session = ''      # Claude session id of the current run
$resumes = 0       # times the current run has been resumed after a dropped connection
$MaxResumes = 6
while ($true) {
  # Offline: wait here, checking every minute, instead of letting a run hang on API retries.
  if (-not (Test-Online)) {
    Write-Host "$(Get-Date -Format HH:mm) Offline. Checking again every minute ..." -ForegroundColor DarkYellow
    while (-not (Test-Online)) {
      # a run that will be resumed keeps its locks: keep them fresh so no other builder takes them over
      if ($resumes -gt 0) { Get-OwnLocks | ForEach-Object { $_.LastWriteTime = Get-Date } }
      Start-Sleep -Seconds 60
    }
    Write-Host "$(Get-Date -Format HH:mm) Back online." -ForegroundColor DarkYellow
  }
  $run++
  if ($resumes -eq 0) { git checkout -q main 2>$null; git pull -q --ff-only 2>$null }
  $prompt = Get-Content -Raw "$WorkDir\docs\prd\BUILDER-PROMPT.md"
  if ($Lane) { $prompt = "Your lanes: $Lane. Only continue or start flows listed in those lanes of status.json. Never touch another lane's PR, even if it looks stalled.`n`n" + $prompt }
  if ($Flows) { $prompt = "Only continue or start these flows: $Flows. Ignore every other flow and PR, even if it looks stalled. If none of them is ready, print NOTHING-TO-DO.`n`n" + $prompt }
  if ($PhoneOnly) {
    $primary = ($Device -eq 'emulator-5554')
    $db = if ($primary) { 'the main stack (db.lock, ports 553xx, Workers 8787/8788)' } else { 'the second stack (tools/db2.mjs, db2.lock, ports 556xx, Workers on --port 8797/8798). The app is built for 127.0.0.1:55321 and :8787, so map them with adb reverse: `adb -s ' + $Device + ' reverse tcp:55321 tcp:55621`, `reverse tcp:8787 tcp:8797`, `reverse tcp:8788 tcp:8798`' }
    $arch = if ($Device -like 'emulator-*') { 'x86_64 (default arch)' } else { 'arm64-v8a (--arch arm64-v8a)' }
    $prompt = "You are a DEVICE builder that owns exactly one test device: $Device (builds for it: $arch). Never touch any other device; another device builder may be working on it. Always pass -s $Device / --serial $Device. First, for every ready (non-draft) PR that GitHub reports as CONFLICTING with main (gh pr view <n> --json mergeable), merge origin/main into it, resolve (usually keep both sides), regenerate database.types.ts raw, run typecheck, lint and pgTAP, and push: CI never runs on a conflicting PR, so it would sit unmerged. Then only do step 0, for open PRs labelled needs-phone, oldest first, one per run (include any Coordinator requests and CI fixes on that PR). Skip a PR another device builder has claimed: claim yours with ``mkdir ~/projects/arpedia-locks/pr-<number>.lock`` (if it exists and is under 30 minutes old, take the next PR) and remove it when the run ends. Your device lock is ~/projects/arpedia-locks/dev-$Device.lock (take it with mkdir, never use phone.lock). Use $db. Every lock you create (device, PR, database) gets an owner file right after mkdir: echo dev-$Device > <lock>/owner, so the loop can clear it if the run dies. Refresh your device, PR and database locks (touch) every 10 minutes. Metro: only the builder on emulator-5554 may use port 8081; others use release builds only (parity without --dev). Run Maestro, gradle and parity in the FOREGROUND (Bash timeout up to 600000 ms, split long jobs per width), never run_in_background: a headless run ends as soon as you stop to wait, which leaves your locks behind and the work unfinished. Never end the run while one of your commands is still running; before the run ends, always remove your device, PR and database locks. If the emulator is gone, never start one yourself: a watchdog restarts it within about 2 minutes (see Devices); wait for it and keep going. When the on-device steps pass, remove the label, run the gates and mark it ready as in step 2. If no unclaimed PR is labelled needs-phone, print NOTHING-TO-DO and stop.`n`n" + $prompt
  }
  if ($Prep) { $prompt = "You are the PREP builder: no test device, never run adb, never use the emulator or db.lock. Use only the second database (tools/db2.mjs, db2.lock). Your job is to keep every open PR labelled needs-phone ready for the device builder, so its runs never wait on code work. Each run, take ONE such PR, oldest first, that is not claimed (skip it if ~/projects/arpedia-locks/pr-<number>.lock exists and is under 30 minutes old; claim yours with mkdir pr-<number>.lock, then echo prep > pr-<number>.lock/owner, and remove it before the run ends; do the same owner file for db2.lock): merge origin/main into it, resolve conflicts (usually keep both sides), regenerate packages/core/src/database.types.ts raw with node tools/db2.mjs reset then types, run typecheck, lint, format:check, Vitest and pgTAP (node tools/db2.mjs test), fix what fails, push, and note in the PR: prepped on <date>, gates green, merged main at <sha>. Keep the needs-phone label. Skip a PR that is already up to date with main and green. Also handle any ready (non-draft) PR that GitHub reports as CONFLICTING the same way. Never mark a PR ready and never remove needs-phone. Run shell commands with the Bash tool (git, mkdir, rm, node), not PowerShell. End every run with the clone back on main. If nothing needs prepping, print NOTHING-TO-DO.`n`n" + $prompt }
  if ($NoPhone) { $prompt = "You have no test device: never run adb against the owner's phone. Skip step 0. Follow 'No test device' below. For the database use the second stack (tools/db2.mjs, db2.lock), never db.lock.`n`n" + $prompt }
  if ($TaskFile) { $prompt = (Get-Content -Raw "$WorkDir/$TaskFile") + "`n`n" + $prompt }
  if ($LockOwner) { $prompt = "Every lock you create gets an owner file right after mkdir: echo $LockOwner > <lock>/owner. Remove all your locks before the run ends.`n`n" + $prompt }
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  Write-Host "`n=== Run $run - $stamp - $Model$(if ($NoPhone) { ' - no phone' })$(if ($resumes) { " - resuming ($resumes)" }) ===" -ForegroundColor Yellow

  $before = (git ls-remote origin 'refs/heads/flow/*' 2>$null | Out-String)
  if ($resumes -gt 0) {
    # The connection dropped mid-run: carry on in the same session instead of starting the PR again.
    $again = "The internet connection dropped and is back. Carry on exactly where you stopped, under the same instructions. Your locks were kept: touch them now. First check what changed while you were away (git status, git fetch, whether the PR moved, whether your device, Workers and any command that was running are still up), then continue. Don't repeat steps that already finished."
    $again | claude -p --resume $session --model $Model --permission-mode acceptEdits --add-dir $LockDir --allowedTools $allowed 2>&1 | Tee-Object -Variable lines | Write-Host
  } else {
    $session = [guid]::NewGuid().ToString()
    $prompt | claude -p --session-id $session --model $Model --permission-mode acceptEdits --add-dir $LockDir --allowedTools $allowed 2>&1 | Tee-Object -Variable lines | Write-Host
  }
  $text = ($lines | Out-String)
  $dropped = $text -match "Can't reach the API server|ENOTFOUND|ECONNRESET|ETIMEDOUT|Unable to connect to API"
  # A run that dies (internet drop, crash) leaves its locks behind, and the next run would wait 30 min
  # for them to go stale. Every lock a builder creates holds an "owner" file; remove ours after each run.
  # A dropped run that will be resumed keeps them.
  $willResume = $dropped -and ($lines.Count -le 5) -and ($resumes -lt $MaxResumes)
  if (-not $willResume) { Get-OwnLocks | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
  $after = (git ls-remote origin 'refs/heads/flow/*' 2>$null | Out-String)
  if ($Topic -and $text -notmatch 'NOTHING-TO-DO|WAITING-FOR-CI') {
    $report = (($lines | ForEach-Object { "$_" }) | Select-Object -Last 14) -join "`n"
    try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$Topic" -Headers @{ Title = "Arpedia run $run done$(if ($Lane) { " ($Lane)" })"; Tags = 'white_check_mark' } -Body ([Text.Encoding]::UTF8.GetBytes($report)) | Out-Null } catch {}
  }

  # only the CLI's own limit messages (a run report may legitimately talk about "rate limits" in code)
  $tail = ($lines | Select-Object -Last 5 | Out-String)
  if ($tail -match "(?i)(usage limit reached|you've hit your( usage| weekly| daily)? limit|you have hit your( usage| weekly| daily)? limit|claude ai usage limit|credit balance is too low)") {
    Write-Host "`nThis Claude account has hit its limit." -ForegroundColor Red
    Write-Host "Switch account with:  claude /login   then run this script again. Work continues from GitHub." -ForegroundColor Red
    break
  }
  $resumes = if ($willResume) { $resumes + 1 } else { 0 }
  if ($willResume) {
    Get-OwnLocks | ForEach-Object { $_.LastWriteTime = Get-Date }
    Write-Host "Connection dropped during the run. Resuming it when online ..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds 30
  } elseif ($dropped -and $lines.Count -le 5) {
    # too many drops in one run: start fresh after the offline check, no 8-minute wait
    Write-Host "Connection dropped during the run. Retrying when online ..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds 30
  } elseif ($text -match 'NOTHING-TO-DO') {
    Write-Host "Nothing ready. Waiting $IdleMinutes minutes ..." -ForegroundColor DarkGray
    Start-Sleep -Seconds ($IdleMinutes * 60)
  } elseif ($text -match 'WAITING-FOR-CI' -or $before -eq $after) {
    # waiting on CI, or the run pushed nothing: don't spin, give CI time
    Write-Host "Waiting on CI / no new push. Next run in $CiWaitMinutes minutes ..." -ForegroundColor DarkGray
    Start-Sleep -Seconds ($CiWaitMinutes * 60)
  } else {
    Start-Sleep -Seconds $BetweenRunsSeconds
  }
}
