# Copy your existing Chrome or Edge GunBroker login to the desk server.
param([switch]$Edge)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$VenvPython = Join-Path $Engine ".venv\Scripts\python.exe"
$SessionFile = Join-Path $Engine "data\sessions\gunbroker.json"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Run .\scripts\setup-desk-data.ps1 first." -ForegroundColor Red
    exit 1
}

if (-not $env:MMD_SSH_HOST) { $env:MMD_SSH_HOST = "modulargunworks" }

Write-Host ""
Write-Host "=== Capture GunBroker from your browser login ===" -ForegroundColor Cyan
Write-Host ""

# Stop background Chrome/Edge so profile files are not locked
Write-Host "Stopping Chrome and Edge background processes..." -ForegroundColor Gray
Get-Process chrome, msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$pyArgs = @("-u", "-m", "mmd_engine.cli.capture_chrome_session", "gunbroker", "-y")
if ($Edge) { $pyArgs += "--edge" }

Push-Location $Engine
$ErrorActionPreference = "Continue"
& $VenvPython @pyArgs
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) { exit $code }

if (-not (Test-Path $SessionFile)) {
    Write-Host "Session file missing." -ForegroundColor Red
    exit 1
}

$bytes = (Get-Item $SessionFile).Length
Write-Host ""
Write-Host "Session file: $bytes bytes" -ForegroundColor Green
Write-Host "Uploading to server..." -ForegroundColor Cyan
scp $SessionFile "${env:MMD_SSH_HOST}:/opt/modular-market-desk/engine/data/sessions/"
ssh $env:MMD_SSH_HOST 'cd /opt/modular-market-desk; sudo docker compose restart api; sleep 3'

Write-Host ""
Write-Host "Done -> https://desk.modulargunworks.com/connections.html" -ForegroundColor Green
Write-Host "Valuate: Sample OFF, Search the web ON." -ForegroundColor Green
Write-Host ""
