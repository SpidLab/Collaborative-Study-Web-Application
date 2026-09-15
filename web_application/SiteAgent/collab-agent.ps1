<#
  Friendly setup + control script for the Collaborative Study Site Agent (Windows).

  How to run: right-click this file -> "Run with PowerShell", OR open PowerShell in
  this folder and type one of:

     .\collab-agent.ps1            run the guided setup, then start
     .\collab-agent.ps1 start      start the agent (background)
     .\collab-agent.ps1 stop       stop the agent
     .\collab-agent.ps1 status     is it running?
     .\collab-agent.ps1 logs       watch what it's doing (Ctrl+C to exit)
     .\collab-agent.ps1 update     get the newest version and restart
     .\collab-agent.ps1 reset      forget settings and start over

  Nothing here touches or uploads your raw data files. They are mounted read-only.

  If you see "running scripts is disabled", run this once in PowerShell:
     Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>
param([string]$Command = "setup")

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$EnvFile = ".env"

function Say($m)  { Write-Host $m }
function OK($m)   { Write-Host "[OK] $m"   -ForegroundColor Green }
function Warn($m) { Write-Host "[!] $m"    -ForegroundColor Yellow }
function Err($m)  { Write-Host "[X] $m"    -ForegroundColor Red }

function Invoke-Compose {
  param([Parameter(ValueFromRemainingArguments=$true)]$Args)
  & docker compose @Args
}

function Test-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Err "Docker is not installed."
    Say ""
    Say "Please install Docker Desktop first (free):"
    Say "  https://www.docker.com/products/docker-desktop/"
    Say ""
    Say "After installing, OPEN Docker Desktop once and wait until it says 'running',"
    Say "then run this script again."
    Start-Process "https://www.docker.com/products/docker-desktop/"
    exit 1
  }
  try { docker info *> $null } catch {
    Err "Docker is installed but not running."
    Say "Please OPEN the Docker Desktop app, wait until it says 'running', then try again."
    exit 1
  }
  OK "Docker is installed and running."
}

function Start-Setup {
  Say ""
  Say "Welcome! Let's connect your computer to the study."
  Say "This takes about 2 minutes. Your raw data never leaves this machine."
  Say ""

  $defaultUrl = "https://collab.example.org"
  $serverUrl = Read-Host "1) Paste the study server address (from your coordinator) [$defaultUrl]"
  if ([string]::IsNullOrWhiteSpace($serverUrl)) { $serverUrl = $defaultUrl }

  Say ""
  Say "2) Pick your top data folder. Inside it you keep ONE sub-folder per dataset,"
  Say "   named like the phenotype you registered, each holding a 'rawdata.csv'."
  Say "   Example:  <this folder>\eye_color\rawdata.csv"
  $defaultDir = Join-Path $env:USERPROFILE "collab-data"
  while ($true) {
    $dataDir = Read-Host "   Top data folder [$defaultDir]"
    if ([string]::IsNullOrWhiteSpace($dataDir)) { $dataDir = $defaultDir }
    if (Test-Path $dataDir) { break }
    Warn "That folder doesn't exist yet: $dataDir"
    $mk = Read-Host "   Create it now? [Y/n]"
    if ($mk -eq "" -or $mk -match "^[Yy]") {
      try { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null; OK "Created $dataDir"; break }
      catch { Err "Couldn't create that path - let's try another path." }
    } else { Say "   Okay - let's pick a different folder." }
  }
  $ds = @(Get-ChildItem -Path $dataDir -Recurse -Depth 1 -Filter rawdata.csv -ErrorAction SilentlyContinue)
  if ($ds.Count -eq 0) { Warn "No dataset folders with a rawdata.csv found yet - you can add them later." } else { OK "Found $($ds.Count) dataset folder(s) with rawdata.csv." }

  Say ""
  Say "3) On the website, go to your account -> 'Connect my computer' and copy the one-time code."
  $code = Read-Host "   Paste the code here"
  while ([string]::IsNullOrWhiteSpace($code)) { $code = Read-Host "   The code can't be empty. Paste it" }

  @(
    "SERVER_URL=$($serverUrl.TrimEnd('/'))"
    "HOST_DATA_DIR=$dataDir"
    "ENROLL_CODE=$code"
    "AGENT_TOKEN="
    "AGENT_IMAGE=collabstudy-agent:local"
  ) | Set-Content -Path $EnvFile -Encoding ASCII
  OK "Saved your settings to .env"
}

function Start-Agent {
  if (-not (Test-Path $EnvFile)) { Err "Not set up yet - run: .\collab-agent.ps1"; exit 1 }
  $image = (Select-String -Path $EnvFile -Pattern '^AGENT_IMAGE=(.*)$').Matches.Groups[1].Value
  Say "Building and starting the agent (first time can take a few minutes)..."
  if ($image -match "/") { Invoke-Compose pull; Invoke-Compose up -d }
  else { Invoke-Compose up -d --build }
  OK "Agent started. It runs in the background and restarts automatically with your computer."
  Say ""
  Say "Watch it work:   .\collab-agent.ps1 logs"
  Say "Check status:    .\collab-agent.ps1 status"
}

switch ($Command.ToLower()) {
  "setup" {
    Test-Docker
    if (Test-Path $EnvFile) {
      $a = Read-Host "Already set up. Reconfigure from scratch? [y/N]"
      if ($a -match "^[Yy]") { Start-Setup }
    } else { Start-Setup }
    Start-Agent
  }
  "start"   { Test-Docker; Start-Agent }
  "stop"    { Invoke-Compose down; OK "Agent stopped." }
  "restart" { Test-Docker; Invoke-Compose down; Start-Agent }
  "status"  {
    $r = docker ps --filter "name=collab-agent" --format "{{.Status}}"
    if ($r) { OK "Agent is RUNNING: $r" } else { Warn "Agent is NOT running. Start it with: .\collab-agent.ps1 start" }
  }
  "logs"    { Invoke-Compose logs -f --tail=50 }
  "update"  { Test-Docker; Say "Updating..."; Invoke-Compose build --pull; Invoke-Compose up -d; OK "Updated and restarted." }
  "reset"   { try { Invoke-Compose down -v } catch {}; Remove-Item $EnvFile -ErrorAction SilentlyContinue; OK "Settings cleared. Run .\collab-agent.ps1 to set up again." }
  default   { Err "Unknown command: $Command"; Say "Use: setup | start | stop | restart | status | logs | update | reset" }
}
