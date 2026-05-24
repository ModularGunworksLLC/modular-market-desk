#!/usr/bin/env bash
set -euo pipefail
cd /opt/modular-market-desk
docker compose exec -T api python <<'PY'
from mmd_engine.valuation_models import FirearmQuery
from mmd_engine.adapters.gunbroker import GunBrokerAdapter

q = FirearmQuery(
    category="handgun",
    manufacturer="Glock",
    model="30",
    variant="Gen 5",
    caliber="45 ACP",
    condition="used",
)
rows = GunBrokerAdapter().fetch(q)
sold = sum(1 for r in rows if r.price_type == "sold")
asking = sum(1 for r in rows if r.price_type == "asking")
print(f"gunbroker rows={len(rows)} sold={sold} asking={asking}")
PY
