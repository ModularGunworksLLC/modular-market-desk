# Copy MMD_API_KEY from server engine/.env into /var/www/desk/config.json (fixes 401 on valuate).
# Usage: .\scripts\fix-desk-api-key.ps1

$ErrorActionPreference = "Stop"
if (-not $env:MMD_SSH_HOST) { $env:MMD_SSH_HOST = "modulargunworks" }

$Root = Split-Path $PSScriptRoot -Parent
$Sh = Join-Path $Root "deploy\fix-desk-api-key.sh"
if (-not (Test-Path $Sh)) {
    Write-Host "Missing $Sh" -ForegroundColor Red
    exit 1
}

Write-Host "Updating desk config.json on $env:MMD_SSH_HOST ..." -ForegroundColor Cyan
scp $Sh "${env:MMD_SSH_HOST}:/tmp/fix-desk-api-key.sh"
ssh $env:MMD_SSH_HOST "sed -i 's/\r$//' /tmp/fix-desk-api-key.sh; chmod +x /tmp/fix-desk-api-key.sh; bash /tmp/fix-desk-api-key.sh"

Write-Host ""
Write-Host "Hard-refresh the desk in your browser (Ctrl+F5), then valuate again." -ForegroundColor Green
