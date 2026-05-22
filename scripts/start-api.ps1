$Root = Split-Path $PSScriptRoot -Parent
Set-Location "$Root\engine"
& .\.venv\Scripts\Activate.ps1
Write-Host "API: http://localhost:8000  (health: /health)" -ForegroundColor Cyan
uvicorn mmd_engine.api.main:app --host 0.0.0.0 --port 8000 --reload
