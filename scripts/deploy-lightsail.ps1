# Deploy Market Desk (Next.js) to Lightsail host "modulargunworks"
# Usage: powershell -File scripts/deploy-lightsail.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Remote = "modulargunworks"
$RemoteDir = "/opt/market-desk-v2"
$Bundle = Join-Path $env:TEMP "market-desk-bundle.tgz"

Write-Host ">> Packing app (no node_modules/.next/data)..."
Push-Location $Root
tar -czf $Bundle `
  --exclude=node_modules `
  --exclude=.next `
  --exclude=data `
  --exclude=.git `
  --exclude=engine `
  --exclude=web `
  .
Pop-Location

Write-Host ">> Uploading to Lightsail..."
ssh $Remote "sudo mkdir -p $RemoteDir/data && sudo chown -R bitnami:bitnami $RemoteDir"
scp $Bundle "${Remote}:/tmp/market-desk-bundle.tgz"
ssh $Remote "cd $RemoteDir && tar xzf /tmp/market-desk-bundle.tgz && rm /tmp/market-desk-bundle.tgz"

if (Test-Path "$Root\.env") {
  Write-Host ">> Uploading .env and desk.db..."
  scp "$Root\.env" "${Remote}:${RemoteDir}/.env.production.local"
  ssh $Remote "cd $RemoteDir && sed -i 's|DATABASE_URL=.*|DATABASE_URL=file:/app/data/desk.db|' .env.production.local && mv .env.production.local .env"
}
# Do not overwrite production desk.db by default — it may contain vault tokens saved on the server.
if ($env:DESK_DEPLOY_WITH_DB -eq "1" -and (Test-Path "$Root\data\desk.db")) {
  Write-Host ">> Uploading desk.db (DESK_DEPLOY_WITH_DB=1)..."
  scp "$Root\data\desk.db" "${Remote}:${RemoteDir}/data/desk.db"
} else {
  Write-Host ">> Skipping desk.db upload (set DESK_DEPLOY_WITH_DB=1 to push local DB)."
}

Write-Host ">> npm install + build on server (Docker npm fails on this instance)..."
ssh $Remote @"
set -e
cd $RemoteDir
sed -i 's|file:/app/data/desk.db|file:./data/desk.db|' .env 2>/dev/null || true
npm install
npm run build
npx tsx scripts/apply-web-comps-migration.ts || true
chmod +x deploy/start-standalone.sh
./deploy/start-standalone.sh
sudo cp deploy/market-desk.service /etc/systemd/system/market-desk.service
sudo systemctl daemon-reload
sudo systemctl enable market-desk
sudo systemctl restart market-desk
sleep 2
curl -s -o /dev/null -w 'desk HTTP %{http_code}\n' http://127.0.0.1:3010/ || true
"@

Write-Host ">> Switching Apache desk.modulargunworks.com -> port 3010..."
ssh $Remote @"
set -e
sudo cp $RemoteDir/deploy/apache-mmd-desk-next.conf /opt/bitnami/apache/conf/vhosts/mmd-desk.conf
sudo /opt/bitnami/ctlscript.sh restart apache
curl -s -o /dev/null -w 'public desk HTTPS %{http_code}\n' https://desk.modulargunworks.com/ || true
"@

Write-Host "Done. Open https://desk.modulargunworks.com"
