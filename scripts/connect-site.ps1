# Log in to a market site in a real browser on your PC, then upload the session to the API server.
#
# Usage:
#   .\scripts\connect-site.ps1 gunbroker
#   .\scripts\connect-site.ps1 gundeals
#
# Requires: engine venv with playwright, apiUrl + apiKey in web\public\config.json

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("gunbroker", "gundeals")]
    [string]$Site,

    [int]$WaitSeconds = 180
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$ConfigPath = Join-Path $Root "web\public\config.json"
$SessionFile = Join-Path $Engine "data\sessions\$Site.json"

if (-not (Test-Path $ConfigPath)) {
    Write-Host "Missing $ConfigPath" -ForegroundColor Red
    exit 1
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if (-not $config.apiUrl -or -not $config.apiKey) {
    Write-Host "Set apiUrl and apiKey in web\public\config.json" -ForegroundColor Red
    exit 1
}

$VenvPython = Join-Path $Engine ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    $VenvPython = "python"
}

Write-Host "Opening $Site in Chrome/Edge — log in, pass captcha, wait $WaitSeconds seconds..." -ForegroundColor Cyan
Push-Location $Engine
try {
    & $VenvPython -m mmd_engine.cli.market_auth $Site --wait-seconds $WaitSeconds
} finally {
    Pop-Location
}

if (-not (Test-Path $SessionFile)) {
    Write-Host "Session file not created: $SessionFile" -ForegroundColor Red
    exit 1
}

$uri = "$($config.apiUrl.TrimEnd('/'))/api/connections/$Site/session"
Write-Host "Uploading session to $uri ..." -ForegroundColor Cyan

$headers = @{
    "X-API-Key"    = $config.apiKey
    "Content-Type" = "application/json"
}

$body = Get-Content $SessionFile -Raw -Encoding UTF8
Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body $body | Out-Null

Write-Host "Uploaded $Site session. Try Valuate on the desk (live search)." -ForegroundColor Green
