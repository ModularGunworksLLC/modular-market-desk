# ONE-TIME: copy sites.local.yaml and .env to Lightsail (then use server-auth-all.sh on server).
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$HostName = if ($env:MMD_SSH_HOST) { $env:MMD_SSH_HOST } else { "modulargunworks" }
$Remote = "/opt/modular-market-desk/engine"

foreach ($name in @("sites.local.yaml", ".env")) {
    $local = Join-Path $Engine $name
    if (-not (Test-Path $local)) {
        Write-Host "Skip $name — not found at $local" -ForegroundColor Yellow
        continue
    }
    Write-Host "Uploading $name -> $HostName`:$Remote/" -ForegroundColor Cyan
    scp $local "${HostName}:${Remote}/"
}

Write-Host ""
Write-Host "On server, run:" -ForegroundColor Green
Write-Host "  ssh $HostName 'cd /opt/modular-market-desk && git pull && sudo docker compose up -d --force-recreate api && bash deploy/server-auth-all.sh'"
