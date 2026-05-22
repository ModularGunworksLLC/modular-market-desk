# Start API + web dev server (two windows)
$Root = Split-Path $PSScriptRoot -Parent

Start-Process powershell -ArgumentList "-NoExit", "-File", "$Root\scripts\start-api.ps1"
Start-Sleep -Seconds 2
Set-Location "$Root\web"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\web'; npm run dev"

Write-Host "Started API (port 8000) and web dev server (port 5173) in new windows." -ForegroundColor Green
Write-Host "Open: http://localhost:5173/modular-market-desk/"
