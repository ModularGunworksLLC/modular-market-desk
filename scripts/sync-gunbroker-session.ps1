# Full GunBroker session pipeline: capture on PC, upload, restart API on Lightsail.
# Manual step: log in when the browser opens (before the timer ends).
#
# Usage: .\scripts\sync-gunbroker-session.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$VenvPython = Join-Path $Engine ".venv\Scripts\python.exe"
$VenvPlaywright = Join-Path $Engine ".venv\Scripts\playwright.exe"
$SessionFile = Join-Path $Engine "data\sessions\gunbroker.json"
$MinBytes = 1500

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:LOCALAPPDATA "ms-playwright"
}

if (-not $env:MMD_SSH_HOST) {
    $env:MMD_SSH_HOST = "modulargunworks"
}

$WaitSeconds = 300
if ($env:MMD_WAIT_SECONDS) {
    $WaitSeconds = [int]$env:MMD_WAIT_SECONDS
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "Missing engine venv." -ForegroundColor Red
    exit 1
}

Write-Host "=== GunBroker session sync ===" -ForegroundColor Cyan
Write-Host "Browser opens for $WaitSeconds seconds. LOG IN to GunBroker now." -ForegroundColor Yellow
Write-Host ""

$chromePath = Join-Path $env:PLAYWRIGHT_BROWSERS_PATH "chromium-1223\chrome-win64\chrome.exe"
if (-not (Test-Path $chromePath)) {
    Write-Host "Installing Playwright Chromium..." -ForegroundColor Gray
    & $VenvPlaywright install chromium
}

Push-Location $Engine
try {
    & $VenvPython -m mmd_engine.cli.market_auth gunbroker --wait-seconds $WaitSeconds
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

if (-not (Test-Path $SessionFile)) {
    Write-Host "Session file not created." -ForegroundColor Red
    exit 1
}

$bytes = (Get-Item $SessionFile).Length
$sessionJson = Get-Content $SessionFile -Raw | ConvertFrom-Json
$cookieCount = 0
if ($null -ne $sessionJson.cookies) {
    $cookieCount = @($sessionJson.cookies).Count
}

if ($bytes -ge $MinBytes) {
    Write-Host "Session: $bytes bytes, $cookieCount cookies" -ForegroundColor Green
}
else {
    Write-Host "Session: $bytes bytes, $cookieCount cookies (thin - may need login)" -ForegroundColor Yellow
}

Write-Host "Uploading to $env:MMD_SSH_HOST ..." -ForegroundColor Cyan
scp $SessionFile "${env:MMD_SSH_HOST}:/opt/modular-market-desk/engine/data/sessions/"

Write-Host "Restarting API on server..." -ForegroundColor Cyan
ssh $env:MMD_SSH_HOST "cd /opt/modular-market-desk && sudo docker compose restart api && sleep 4 && curl -s https://api.modulargunworks.com/health"

Write-Host ""
Write-Host "Done. Test https://desk.modulargunworks.com" -ForegroundColor Green
