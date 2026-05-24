# One-time setup: GunBroker login window on YOUR computer, then everything uploads to Lightsail.
# You only interact when the browser opens (login + MFA). The script does the rest.
#
# Usage:  .\scripts\setup-desk-data.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "=== Modular Market Desk — data setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "What this does FOR you:" -ForegroundColor White
Write-Host "  1. Opens GunBroker in a browser ON THIS COMPUTER (not on Amazon)" -ForegroundColor Gray
Write-Host "  2. YOU log in + complete MFA in that window (about 2 minutes)" -ForegroundColor Yellow
Write-Host "  3. Script uploads session to desk.modulargunworks.com automatically" -ForegroundColor Gray
Write-Host "  4. After that, use https://desk.modulargunworks.com normally" -ForegroundColor Gray
Write-Host ""
Write-Host "You do NOT run the desk on your PC every day — only this login step once." -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "Press Enter to open the GunBroker browser (or Ctrl+C to cancel)"
if ($confirm -eq "q") { exit 0 }

$env:MMD_WAIT_SECONDS = "600"
& (Join-Path $Root "scripts\sync-gunbroker-session.ps1")

Write-Host ""
Write-Host "Next: open https://desk.modulargunworks.com/connections.html" -ForegroundColor Cyan
Write-Host "  GunBroker should show Connected." -ForegroundColor Cyan
Write-Host "  For Valuate: uncheck Sample, try Search the web now (may take 15 min)." -ForegroundColor Cyan
Write-Host "  If live search still empty, we will copy cache in a follow-up step." -ForegroundColor Cyan
Write-Host ""
