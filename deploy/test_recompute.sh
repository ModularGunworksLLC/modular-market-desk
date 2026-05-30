#!/usr/bin/env bash
set -euo pipefail
KEY="$(grep '^MMD_API_KEY=' /opt/modular-market-desk/engine/.env | cut -d= -f2- | tr -d '\r')"
CODE="$(curl -s -o /tmp/r.json -w '%{http_code}' -X POST http://127.0.0.1:8000/api/recompute \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $KEY" \
  -d '{"manufacturer":"Canik","model":"TTI Combat","caliber":"9mm","context":"auction_sniper","buyer_premium_pct":22,"target_profit":75}')"
echo "recompute_http=$CODE"
python3 - <<'PY'
import json
d = json.load(open("/tmp/r.json"))
ins = d.get("insights", {})
brief = ins.get("dealer_brief", {})
print("verdict", brief.get("verdict"))
print("max_bid", ins.get("max_bid"))
print("max_hammer", (brief.get("ceilings") or {}).get("max_hammer"))
PY
