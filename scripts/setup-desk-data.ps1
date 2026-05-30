# One-time setup: GunBroker login on your computer, then upload to Lightsail.
# Usage:  .\scripts\setup-desk-data.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$VenvPython = Join-Path $Engine ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host 'First-time: installing Python tools, one time only...' -ForegroundColor Yellow
    Set-Location $Engine
    python -m venv .venv
    & .\.venv\Scripts\Activate.ps1
    pip install -q -r requirements.txt
    pip install -q -e .
    playwright install chromium
    Set-Location $Root
}

Write-Host ""
Write-Host "=== Modular Market Desk - data setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "What this does FOR you:" -ForegroundColor White
Write-Host '  1. Opens GunBroker in a browser on this computer, not on Amazon cloud' -ForegroundColor Gray
Write-Host '  2. YOU log in and complete MFA in that window' -ForegroundColor Yellow
Write-Host "  3. Script uploads session to desk.modulargunworks.com automatically" -ForegroundColor Gray
Write-Host "  4. After that, use https://desk.modulargunworks.com normally" -ForegroundColor Gray
Write-Host ""
Write-Host "You do NOT run the desk on your PC every day - only this login step once." -ForegroundColor Green
Write-Host ""

$null = Read-Host "Press Enter to open the GunBroker browser, or Ctrl+C to cancel"

$env:MMD_WAIT_SECONDS = "600"
& (Join-Path $Root "scripts\sync-gunbroker-session.ps1")

Write-Host ""
Write-Host "Next: open https://desk.modulargunworks.com/connections.html" -ForegroundColor Cyan
Write-Host "  GunBroker should show Connected." -ForegroundColor Cyan
Write-Host '  For Valuate: uncheck Sample, try Search the web now.' -ForegroundColor Cyan
Write-Host ""
