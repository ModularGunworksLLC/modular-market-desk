# Full local setup for Modular Market Desk
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host "=== Modular Market Desk setup ===" -ForegroundColor Cyan

# Engine
Write-Host "`n[1/5] Python engine..." -ForegroundColor Yellow
Set-Location "$Root\engine"
if (-not (Test-Path .venv)) {
    python -m venv .venv
}
& .\.venv\Scripts\Activate.ps1
pip install -q -r requirements.txt
pip install -q -e .
playwright install chromium

Write-Host "`n[2/5] Sample wholesale CSV..." -ForegroundColor Yellow
python -m mmd_engine.cli.import_csv -s lipseys -f data/imports/examples/lipseys_sample.csv -p lipseys --replace

# Web
Write-Host "`n[3/5] Web dashboard..." -ForegroundColor Yellow
Set-Location "$Root\web"
if (-not (Test-Path node_modules)) {
    npm install
}
npm run build

Set-Location $Root
Write-Host "`n[4/5] Setup complete." -ForegroundColor Green
Write-Host "`nStart API:  .\scripts\start-api.ps1"
Write-Host "Start UI:   cd web; npm run dev"
Write-Host "Or both:    .\scripts\start-all.ps1"
