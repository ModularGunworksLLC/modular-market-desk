# Build desk for desk.modulargunworks.com (assets at /, not /modular-market-desk/) and deploy.
# Usage: .\scripts\deploy-desk.ps1

$ErrorActionPreference = "Stop"
if (-not $env:MMD_SSH_HOST) { $env:MMD_SSH_HOST = "modulargunworks" }

$Root = Split-Path $PSScriptRoot -Parent
Write-Host "Deploying desk to $env:MMD_SSH_HOST (VITE_BASE_PATH=/)..." -ForegroundColor Cyan

$remote = @'
set -e
cd /opt/modular-market-desk/web
export VITE_BASE_PATH=/
npm run build
sudo rm -rf /var/www/desk/*
sudo cp -r dist/* /var/www/desk/
sudo find /var/www/desk -type d -exec chmod 755 {} \;
sudo find /var/www/desk -type f -exec chmod 644 {} \;
if [ -f /tmp/fix-desk-api-key.sh ]; then sed -i 's/\r$//' /tmp/fix-desk-api-key.sh; bash /tmp/fix-desk-api-key.sh; elif [ -f /opt/modular-market-desk/deploy/fix-desk-api-key.sh ]; then sed -i 's/\r$//' /opt/modular-market-desk/deploy/fix-desk-api-key.sh; bash /opt/modular-market-desk/deploy/fix-desk-api-key.sh; fi
grep -E 'src=|href=.*css|dealer-desk' /var/www/desk/index.html | head -4
'@
$FixSh = Join-Path $Root "deploy\fix-desk-api-key.sh"
if (Test-Path $FixSh) {
    scp $FixSh "${env:MMD_SSH_HOST}:/tmp/fix-desk-api-key.sh"
}
ssh $env:MMD_SSH_HOST $remote

Write-Host ""
Write-Host "Done. Hard-refresh https://desk.modulargunworks.com (Ctrl+F5)" -ForegroundColor Green
