#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${MMD_APP_DIR:-/opt/modular-market-desk}"
cd "$APP_DIR"
KEY=$(grep '^MMD_API_KEY=' /tmp/mmd_api_key.txt | cut -d= -f2-)
python3 <<PY
import json
from pathlib import Path
key = """$KEY"""
d = json.loads(Path("web/public/config.production.example.json").read_text())
d["apiKey"] = key
Path("web/public/config.json").write_text(json.dumps(d, indent=2) + "\n")
print("wrote web/public/config.json")
PY
cd web
export VITE_BASE_PATH=/
npm ci
npm run build
sudo mkdir -p /var/www/desk
sudo cp -r dist/* /var/www/desk/
echo "Desk deployed to /var/www/desk"
