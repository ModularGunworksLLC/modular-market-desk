# Capture Outdoor Analytics bearer token on PC and upload to Lightsail.
#
# Usage:
#   .\scripts\sync-oa-session.ps1              # Chrome profile capture + upload
#   .\scripts\sync-oa-session.ps1 -UploadOnly  # upload existing token file only
#   .\scripts\sync-oa-session.ps1 -Manual      # show copy-from-Chrome steps

param([switch]$UploadOnly, [switch]$Manual, [switch]$Edge)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Engine = Join-Path $Root "engine"
$VenvPython = Join-Path $Engine ".venv\Scripts\python.exe"

if ($Manual) {
    Push-Location $Engine
    & $VenvPython -m mmd_engine.cli.oa_auth --manual
    Pop-Location
    exit $LASTEXITCODE
}

& (Join-Path $PSScriptRoot "capture-oa-from-chrome.ps1") -UploadOnly:$UploadOnly -Edge:$Edge
