#!/bin/bash
set -e
cat > /tmp/v.json <<'EOF'
{"category":"handgun","manufacturer":"Glock","model":"30","variant":"Gen 5","caliber":"45 ACP","condition":"used","context":"auction_sniper","sample_only":true}
EOF
KEY=$(grep MMD_API_KEY= /opt/modular-market-desk/engine/.env | cut -d= -f2)
curl -s -X POST http://127.0.0.1:8000/api/valuate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d @/tmp/v.json -o /tmp/v-out.json
python3 <<'PY'
import json
d=json.load(open("/tmp/v-out.json"))
print("headline:", (d.get("insights") or {}).get("headline", "?")[:120])
print("listings:", len(d.get("listings") or []))
print("sources:", d.get("source_status"))
print("meta:", d.get("meta"))
PY
