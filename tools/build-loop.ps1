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
  [string]$Repo = 'arpedia-africa/arpedia'
)
$ErrorActionPreference = 'Continue'

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

$run = 0
while ($true) {
  $run++
  git checkout -q main 2>$null; git pull -q --ff-only 2>$null
  $prompt = Get-Content -Raw "$WorkDir\docs\prd\BUILDER-PROMPT.md"
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  Write-Host "`n=== Run $run - $stamp - $Model ===" -ForegroundColor Yellow

  $before = (git ls-remote origin 'refs/heads/flow/*' 2>$null | Out-String)
  $prompt | claude -p --model $Model --permission-mode acceptEdits --allowedTools $allowed 2>&1 | Tee-Object -Variable lines | Write-Host
  $text = ($lines | Out-String)
  $after = (git ls-remote origin 'refs/heads/flow/*' 2>$null | Out-String)

  if ($text -match '(?i)usage limit|rate limit|limit reached|credit balance|quota') {
    Write-Host "`nThis Claude account has hit its limit." -ForegroundColor Red
    Write-Host "Switch account with:  claude /login   then run this script again. Work continues from GitHub." -ForegroundColor Red
    break
  }
  if ($text -match 'NOTHING-TO-DO') {
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
