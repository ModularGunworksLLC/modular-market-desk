# Expose local API to the internet (for GitHub Pages live Valuate)
# Keep this window open while using the public dashboard.
$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cf)) {
    Write-Error "Install cloudflared: winget install Cloudflare.cloudflared"
}
Write-Host "Tunneling http://127.0.0.1:8000 — copy the https://....trycloudflare.com URL into web/public/config.json apiUrl" -ForegroundColor Cyan
& $cf tunnel --url http://127.0.0.1:8000
