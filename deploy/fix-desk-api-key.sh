#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${MMD_APP_DIR:-/opt/modular-market-desk}"
ENV_FILE="$APP_DIR/engine/.env"
CFG="/var/www/desk/config.json"
if [[ ! -f "$CFG" ]]; then
  CFG="/var/www/desk/public/config.json"
fi
KEY="$(grep '^MMD_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')"
if [[ -z "$KEY" ]]; then
  echo "MMD_API_KEY is empty in $ENV_FILE" >&2
  exit 1
fi
python3 - "$CFG" "$KEY" <<'PY'
import json
import sys
from pathlib import Path

cfg = Path(sys.argv[1])
key = sys.argv[2].strip()
data = json.loads(cfg.read_text(encoding="utf-8"))
data["apiKey"] = key
api_url = (data.get("apiUrl") or "").strip()
if not api_url or "localhost" in api_url or "127.0.0.1" in api_url:
    data["apiUrl"] = "https://api.modulargunworks.com"
if not data.get("companySiteUrl"):
    data["companySiteUrl"] = "https://modulargunworks.com"
if not data.get("ledgerUrl"):
    data["ledgerUrl"] = "https://ledger.modulargunworks.com"
out = json.dumps(data, indent=2) + "\n"
tmp = Path("/tmp/desk-config.json")
tmp.write_text(out, encoding="utf-8")
print(f"Wrote {tmp} (apiKey length {len(key)})")
PY
sudo cp /tmp/desk-config.json "$CFG"
sudo chown www-data:www-data "$CFG" 2>/dev/null || true
echo "Installed $CFG"
