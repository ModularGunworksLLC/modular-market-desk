# Create or update GitHub repo and push (requires gh auth login or GH_TOKEN)
param(
    [string]$Org = "ModularGunworksLLC",
    [string]$Repo = "modular-market-desk"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "Install GitHub CLI: https://cli.github.com/"
}

$remote = gh repo view "$Org/$Repo" 2>$null
if ($LASTEXITCODE -ne 0) {
    gh repo create $Repo --public `
        --description "Single-Item Valuation Desk - Modular Gunworks LLC" `
        --source=. --remote=origin --push
} else {
    git push -u origin main
}

Write-Host ""
Write-Host "Repo: https://github.com/$Org/$Repo"
Write-Host "Pages (after Actions deploy): https://$Org.github.io/$Repo/"
Write-Host "Enable Pages: Settings -> Pages -> GitHub Actions"
