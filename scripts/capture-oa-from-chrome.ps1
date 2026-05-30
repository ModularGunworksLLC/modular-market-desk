# Capture Outdoor Analytics token using your real Chrome/Edge profile (Cloudflare-friendly).
# If Cloudflare still loops, use manual copy: python -m mmd_engine.cli.oa_auth --manual
#
# Usage: .\scripts\capture-oa-from-chrome.ps1
#        .\scripts\capture-oa-from-chrome.ps1 -Edge

param([switch]$Edge, [switch]$UploadOnly)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$VenvPython = Join-Path $Engine ".venv\Scripts\python.exe"
$SessionFile = Join-Path $Engine "data\sessions\outdoor_analytics.json"

if (-not $env:MMD_SSH_HOST) { $env:MMD_SSH_HOST = "modulargunworks" }

$WaitSeconds = 300
if ($env:MMD_OA_WAIT_SECONDS) { $WaitSeconds = [int]$env:MMD_OA_WAIT_SECONDS }

if (-not (Test-Path $VenvPython)) {
    Write-Host "Run .\scripts\setup-desk-data.ps1 first." -ForegroundColor Red
    exit 1
}

if ($UploadOnly) {
    if (-not (Test-Path $SessionFile)) {
        Write-Host "Missing $SessionFile - capture or paste token first." -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host ""
    Write-Host "=== Outdoor Analytics token (Chrome profile) ===" -ForegroundColor Cyan
    Write-Host "Close ALL Chrome/Edge windows (check system tray)." -ForegroundColor Yellow
    Write-Host "Stopping background Chrome/Edge..." -ForegroundColor Gray
    Get-Process chrome, msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    $pyArgs = @("-m", "mmd_engine.cli.oa_auth", "--chrome-profile", "--wait-seconds", "$WaitSeconds")
    if ($Edge) { $pyArgs += "--edge" }

    Push-Location $Engine
    try {
        & $VenvPython @pyArgs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $SessionFile)) {
        Write-Host "Token file missing." -ForegroundColor Red
        Write-Host "Try manual copy: cd engine; python -m mmd_engine.cli.oa_auth --manual" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Uploading to $env:MMD_SSH_HOST ..." -ForegroundColor Cyan
scp $SessionFile "${env:MMD_SSH_HOST}:/opt/modular-market-desk/engine/data/sessions/"

Write-Host "Restarting API..." -ForegroundColor Cyan
ssh $env:MMD_SSH_HOST 'cd /opt/modular-market-desk; sudo docker compose restart api; sleep 4; curl -s https://api.modulargunworks.com/health'

Write-Host ""
Write-Host "Done -> https://desk.modulargunworks.com" -ForegroundColor Green
