#!/usr/bin/env bash
# Refresh all market + dealer Playwright sessions inside the API container.
set -euo pipefail

APP_DIR="${MMD_APP_DIR:-/opt/modular-market-desk}"
cd "$APP_DIR"

if [[ ! -f engine/sites.local.yaml ]]; then
  echo "Missing engine/sites.local.yaml"
  echo "Copy from PC or: cp engine/sites.local.yaml.example engine/sites.local.yaml && nano engine/sites.local.yaml"
  exit 1
fi

echo "=== Modular Market Desk — refresh sessions ==="
docker compose ps
echo ""

docker compose exec -T api python -m mmd_engine.cli.credentials_cmd || true
echo ""

docker compose exec -T api python -m mmd_engine.cli.auth_batch --wait-ms 8000
echo ""

echo "API health:"
curl -sf https://api.modulargunworks.com/health || curl -sf http://127.0.0.1:8000/health
echo ""
