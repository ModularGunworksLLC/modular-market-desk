# Upload Playwright session files from your PC to the Lightsail API host.
# Run after: python -m mmd_engine.cli.market_auth gunbroker
#
# Usage:
#   $env:MMD_SSH_HOST = "ubuntu@YOUR_LIGHTSAIL_IP"
#   .\scripts\push-sessions.ps1
#
# Optional:
#   $env:MMD_REMOTE_PATH = "/opt/modular-market-desk/engine/data/sessions"
#   $env:MMD_SESSIONS    = "gunbroker,gundeals"

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$LocalSessions = Join-Path $Root "engine\data\sessions"

if (-not $env:MMD_SSH_HOST) {
    $env:MMD_SSH_HOST = "modulargunworks"
}

$RemotePath = if ($env:MMD_REMOTE_PATH) { $env:MMD_REMOTE_PATH } else { "/opt/modular-market-desk/engine/data/sessions" }
$SessionList = if ($env:MMD_SESSIONS) { $env:MMD_SESSIONS -split "," } else { @("gunbroker", "gundeals") }

if (-not (Test-Path $LocalSessions)) {
    New-Item -ItemType Directory -Path $LocalSessions -Force | Out-Null
}

$Uploaded = 0
foreach ($name in $SessionList) {
    $name = $name.Trim()
    $local = Join-Path $LocalSessions "$name.json"
    if (-not (Test-Path $local)) {
        Write-Host "Skip $name — not found at $local" -ForegroundColor Yellow
        continue
    }
    Write-Host "Uploading $name.json → $env:MMD_SSH_HOST`:$RemotePath/" -ForegroundColor Cyan
    scp $local "${env:MMD_SSH_HOST}:${RemotePath}/"
    $Uploaded++
}

if ($Uploaded -eq 0) {
    Write-Host "No sessions uploaded. Run market_auth first:" -ForegroundColor Yellow
    Write-Host "  cd engine; python -m mmd_engine.cli.market_auth gunbroker"
    exit 1
}

Write-Host "Restarting API on server..." -ForegroundColor Cyan
ssh $env:MMD_SSH_HOST "cd /opt/modular-market-desk && sudo docker compose restart api && sleep 3 && curl -s https://api.modulargunworks.com/health"
Write-Host "`nDone." -ForegroundColor Green
