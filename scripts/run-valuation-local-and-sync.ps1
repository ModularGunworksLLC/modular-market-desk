# Run live Valuate on YOUR PC (home IP), then upload cache to Lightsail.
# On desk: UNCHECK "Search the web now", then Valuate — uses synced cache.
#
# Usage:
#   .\scripts\run-valuation-local-and-sync.ps1
#   .\scripts\run-valuation-local-and-sync.ps1 -Manufacturer Glock -Model 30 -Variant "Gen 5"

param(
    [string]$Manufacturer = "Glock",
    [string]$Model = "30",
    [string]$Variant = "Gen 5",
    [string]$Caliber = "45 ACP",
    [string]$Category = "handgun",
    [string]$Condition = "used"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$VenvPython = Join-Path $Engine ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Run .\scripts\setup-desk-data.ps1 first to install Python tools." -ForegroundColor Red
    exit 1
}

if (-not $env:MMD_SSH_HOST) { $env:MMD_SSH_HOST = "modulargunworks" }

Write-Host ""
Write-Host "=== Local valuation + sync to Lightsail ===" -ForegroundColor Cyan
Write-Host "Uses your home internet (not AWS) so GunBroker/TGV can load." -ForegroundColor Gray
Write-Host ""

$pyArgs = @(
    "-u", "-m", "mmd_engine.cli.run_local_valuate",
    "--manufacturer", $Manufacturer,
    "--model", $Model,
    "--variant", $Variant,
    "--caliber", $Caliber,
    "--category", $Category,
    "--condition", $Condition
)

Push-Location $Engine
$ErrorActionPreference = "Continue"
& $VenvPython @pyArgs
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0 -and $code -ne 2) { exit $code }

# Find newest cache file (run_local_valuate prints path; grab latest mtime)
$cacheDir = Join-Path $Engine "data\valuation_cache"
$latest = Get-ChildItem $cacheDir -Filter "*.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latest) {
    Write-Host "No cache file found under engine\data\valuation_cache" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Uploading cache: $($latest.Name) ($([int]$latest.Length) bytes)..." -ForegroundColor Cyan
scp $latest.FullName "${env:MMD_SSH_HOST}:/opt/modular-market-desk/engine/data/valuation_cache/"

Write-Host ""
Write-Host "Done. On https://desk.modulargunworks.com/" -ForegroundColor Green
Write-Host "  1. UNCHECK 'Search the web now'" -ForegroundColor Yellow
Write-Host "  2. Click Valuate (same firearm fields as above)" -ForegroundColor Yellow
Write-Host ""

if ($code -eq 2) {
    Write-Host "Local scrape returned 0 listings — fix GunBroker login, then run again." -ForegroundColor Red
    exit 2
}
