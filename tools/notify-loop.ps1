# Push build progress to your phone with ntfy every N minutes.
# Usage: powershell -ExecutionPolicy Bypass -File tools\notify-loop.ps1 -Topic arpedia-build-xxxx [-Minutes 10] [-BuilderLog path]
# Subscribe to the same topic in the ntfy app (ntfy.sh). Topic names are public to anyone who knows them: keep it random.
param(
  [Parameter(Mandatory = $true)][string]$Topic,
  [int]$Minutes = 10,
  [string]$Repo = 'arpedia-africa/arpedia',
  [string[]]$BuilderLog = @()   # one or more builder logs, comma-separated
)
$ErrorActionPreference = 'Continue'
$BuilderLog = @($BuilderLog | ForEach-Object { $_ -split "," } | Where-Object { $_ })   # -File passes "a,b" as one string
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$lastSha = ''

function Send-Ntfy([string]$title, [string]$body, [string]$tags = 'hammer', [string]$prio = 'default', [string]$click = '') {
  $h = @{ Title = $title; Tags = $tags; Priority = $prio }
  if ($click) { $h.Click = $click }
  try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$Topic" -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null }
  catch { Write-Host "ntfy send failed: $($_.Exception.Message)" }
}

while ($true) {
  $prs = gh pr list --repo $Repo --state open --json number,title,headRefName,url,body,isDraft | ConvertFrom-Json
  $lines = @(); $tags = 'hammer'; $prio = 'default'; $click = ''; $newest = ''
  foreach ($pr in $prs) {
    $done = ([regex]::Matches($pr.body, '- \[x\]')).Count
    $all = ([regex]::Matches($pr.body, '- \[[ x]\]')).Count
    $next = ([regex]::Match($pr.body, '\*\*Next step:\*\*\s*(.+)')).Groups[1].Value
    if ($next.Length -gt 140) { $next = $next.Substring(0, 140) + '...' }
    $commits = gh api "repos/$Repo/commits?sha=$($pr.headRefName)&per_page=3" | ConvertFrom-Json
    $head = $commits[0]
    if (-not $newest) { $newest = $head.sha }
    $msg = ($head.commit.message -split "`n")[0]
    $when = ([datetime]$head.commit.author.date).ToLocalTime().ToString('HH:mm')
    $lines += "$($pr.title): $done/$all steps"
    $lines += "Last ($when): $msg"
    if ($next) { $lines += "Next: $next" }
    $click = $pr.url
  }
  # merged recently?
  $merged = gh pr list --repo $Repo --state merged --limit 1 --json title,mergedAt | ConvertFrom-Json
  if ($merged -and ([datetime]$merged[0].mergedAt) -gt (Get-Date).AddMinutes(-$Minutes)) {
    $lines = @("MERGED: $($merged[0].title)") + $lines; $tags = 'tada'; $prio = 'high'
  }
  # builder stopped on a usage limit?
  $tail = ($BuilderLog | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { (Get-Content $_ -Tail 20 -ErrorAction SilentlyContinue) -join "`n" }) -join "`n"
  if ($tail) {
    if ($tail -match 'hit its limit') { $lines = @('Builder STOPPED: Claude account hit its limit. Run claude /login with another account and restart.') + $lines; $tags = 'warning'; $prio = 'high' }
  }
  if (-not $prs) { $lines += 'No open flow PR right now (waiting or between flows).' }
  if ($newest -and $newest -eq $lastSha -and $prio -ne 'high') { $lines = @('No new commits in the last ' + $Minutes + ' min (still working).') + $lines; $tags = 'hourglass' }
  $lastSha = $newest

  Send-Ntfy -title 'Arpedia build' -body ($lines -join "`n") -tags $tags -prio $prio -click $click
  Write-Host "$(Get-Date -Format HH:mm) sent: $($lines[0])"
  Start-Sleep -Seconds ($Minutes * 60)
}
