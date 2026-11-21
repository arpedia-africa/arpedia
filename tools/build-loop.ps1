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
  [switch]$NoPhone,                # builder that never uses the phone: hands on-device checks back (label needs-phone)
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
  'Bash(cp:*)','Bash(mv:*)','Bash(rm:*)','Bash(touch:*)','Bash(echo:*)','Bash(sed:*)','Bash(jq:*)','Bash(curl:*)'
)

function Test-Online {
  try { $c = New-Object Net.Sockets.TcpClient; $ok = $c.ConnectAsync('api.anthropic.com', 443).Wait(5000); $c.Close(); return $ok } catch { return $false }
}

$run = 0
while ($true) {
  # Offline: wait here, checking every minute, instead of letting a run hang on API retries.
  if (-not (Test-Online)) {
    Write-Host "$(Get-Date -Format HH:mm) Offline. Checking again every minute ..." -ForegroundColor DarkYellow
    while (-not (Test-Online)) { Start-Sleep -Seconds 60 }
    Write-Host "$(Get-Date -Format HH:mm) Back online." -ForegroundColor DarkYellow
  }
  $run++
  git checkout -q main 2>$null; git pull -q --ff-only 2>$null
  $prompt = Get-Content -Raw "$WorkDir\docs\prd\BUILDER-PROMPT.md"
  if ($Lane) { $prompt = "Your lanes: $Lane. Only continue or start flows listed in those lanes of status.json. Never touch another lane's PR, even if it looks stalled.`n`n" + $prompt }
  if ($Flows) { $prompt = "Only continue or start these flows: $Flows. Ignore every other flow and PR, even if it looks stalled. If none of them is ready, print NOTHING-TO-DO.`n`n" + $prompt }
  if ($PhoneOnly) {
    $primary = ($Device -eq 'emulator-5554')
    $db = if ($primary) { 'the main stack (db.lock, ports 553xx, Workers 8787/8788)' } else { 'the second stack (tools/db2.mjs, db2.lock, ports 556xx, Workers on --port 8797/8798). The app is built for 127.0.0.1:55321 and :8787, so map them with adb reverse: `adb -s ' + $Device + ' reverse tcp:55321 tcp:55621`, `reverse tcp:8787 tcp:8797`, `reverse tcp:8788 tcp:8798`' }
    $arch = if ($Device -like 'emulator-*') { 'x86_64 (default arch)' } else { 'arm64-v8a (--arch arm64-v8a)' }
    $prompt = "You are a DEVICE builder that owns exactly one test device: $Device (builds for it: $arch). Never touch any other device; another device builder may be working on it. Always pass -s $Device / --serial $Device. Only do step 0, for open PRs labelled needs-phone, oldest first, one per run (include any Coordinator requests and CI fixes on that PR). Skip a PR another device builder has claimed: claim yours with ``mkdir ~/projects/arpedia-locks/pr-<number>.lock`` (if it exists and is under 30 minutes old, take the next PR) and remove it when the run ends. Your device lock is ~/projects/arpedia-locks/dev-$Device.lock (take it with mkdir, never use phone.lock). Use $db. Refresh your device, PR and database locks (touch) every 10 minutes. Metro: only the builder on emulator-5554 may use port 8081; others use release builds only (parity without --dev). Run Maestro, gradle and parity in the FOREGROUND (Bash timeout up to 600000 ms, split long jobs per width), never run_in_background: a headless run ends as soon as you stop to wait, which leaves your locks behind and the work unfinished. Never end the run while one of your commands is still running; before the run ends, always remove your device, PR and database locks. If the emulator is gone, start it yourself (see Devices) and keep going. When the on-device steps pass, remove the label, run the gates and mark it ready as in step 2. If no unclaimed PR is labelled needs-phone, print NOTHING-TO-DO and stop.`n`n" + $prompt
  }
  if ($NoPhone) { $prompt = "You have no test device: never run adb against the owner's phone. Skip step 0. Follow 'No test device' below. For the database use the second stack (tools/db2.mjs, db2.lock), never db.lock.`n`n" + $prompt }
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  Write-Host "`n=== Run $run - $stamp - $Model$(if ($NoPhone) { ' - no phone' }) ===" -ForegroundColor Yellow

  $before = (git ls-remote origin 'refs/heads/flow/*' 2>$null | Out-String)
  $prompt | claude -p --model $Model --permission-mode acceptEdits --add-dir $LockDir --allowedTools $allowed 2>&1 | Tee-Object -Variable lines | Write-Host
  $text = ($lines | Out-String)
  $after = (git ls-remote origin 'refs/heads/flow/*' 2>$null | Out-String)
  if ($Topic -and $text -notmatch 'NOTHING-TO-DO|WAITING-FOR-CI') {
    $report = (($lines | ForEach-Object { "$_" }) | Select-Object -Last 14) -join "`n"
    try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$Topic" -Headers @{ Title = "Arpedia run $run done$(if ($Lane) { " ($Lane)" })"; Tags = 'white_check_mark' } -Body ([Text.Encoding]::UTF8.GetBytes($report)) | Out-Null } catch {}
  }

  # only the CLI's own limit messages (a run report may legitimately talk about "rate limits" in code)
  $tail = ($lines | Select-Object -Last 5 | Out-String)
  if ($tail -match "(?i)(usage limit reached|you've hit your( usage)? limit|you have hit your( usage)? limit|claude ai usage limit|credit balance is too low)") {
    Write-Host "`nThis Claude account has hit its limit." -ForegroundColor Red
    Write-Host "Switch account with:  claude /login   then run this script again. Work continues from GitHub." -ForegroundColor Red
    break
  }
  if ($text -match "Can't reach the API server|ENOTFOUND|ECONNRESET|ETIMEDOUT") {
    # the connection dropped mid-run: go straight back to the offline check, no 8-minute wait
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
