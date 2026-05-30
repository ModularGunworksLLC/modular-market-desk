# Save Outdoor Analytics token from Chrome clipboard (no editing python.exe).
#
# 1. In Chrome on https://hub.outdooranalytics.com/pricing (logged in), F12 -> Console:
#    copy(sessionStorage.getItem('gb_session_token'))
# 2. Run this script (clipboard must be the token ONLY, not PowerShell commands):
#    .\scripts\save-oa-token.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$Python = Join-Path $Engine ".venv\Scripts\python.exe"
$TokenFile = Join-Path $Engine "data\sessions\oa-token-paste.txt"

if (-not (Test-Path $Python)) {
    Write-Host "Missing venv. Run .\scripts\setup-desk-data.ps1" -ForegroundColor Red
    exit 1
}

$token = (Get-Clipboard -Raw)
if (-not $token) {
    Write-Host "Clipboard is empty." -ForegroundColor Red
    Write-Host "In Chrome Console run: copy(sessionStorage.getItem('gb_session_token'))" -ForegroundColor Yellow
    exit 1
}

$token = $token.Trim().Trim('"').Trim([char]0xFEFF)
if ($token -match '[\\]|scripts\\|^\s*cd\s') {
    Write-Host "Clipboard has PowerShell text, not the token." -ForegroundColor Red
    Write-Host ""
    Write-Host "Do this in order:" -ForegroundColor Yellow
    Write-Host "  1. Chrome -> https://hub.outdooranalytics.com/pricing (logged in)" -ForegroundColor Gray
    Write-Host "  2. F12 -> Console -> run ONLY:" -ForegroundColor Gray
    Write-Host "     copy(sessionStorage.getItem('gb_session_token'))" -ForegroundColor Cyan
    Write-Host "  3. Run this script again immediately (do not copy anything else)" -ForegroundColor Gray
    exit 1
}
if ($token.Length -lt 40) {
    Write-Host "Token too short ($($token.Length) chars). Copy the full gb_session_token value." -ForegroundColor Red
    exit 1
}

$dir = Split-Path $TokenFile -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($TokenFile, $token, $utf8NoBom)

Write-Host "Saving token ($($token.Length) characters)..." -ForegroundColor Cyan
Push-Location $Engine
try {
    & $Python -m mmd_engine.cli.oa_auth --token-file "data\sessions\oa-token-paste.txt"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
    Remove-Item $TokenFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Saved. Upload to server:" -ForegroundColor Green
Write-Host "  .\scripts\sync-oa-session.ps1 -UploadOnly" -ForegroundColor Gray
