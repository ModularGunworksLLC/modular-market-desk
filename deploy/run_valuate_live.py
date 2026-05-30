import json
import httpx
from mmd_engine.config import api_key

payload = {
    "category": "handgun",
    "manufacturer": "Glock",
    "model": "30",
    "variant": "Gen 5",
    "caliber": "45 ACP",
    "condition": "used",
    "context": "auction_sniper",
    "sample_only": False,
    "force_refresh": True,
    "use_cache": False,
    "buyer_premium_pct": 18,
    "listing_addons": 10,
}
headers = {"X-API-Key": api_key()}
print("POST live valuate (may take 3+ min)...", flush=True)
r = httpx.post("http://127.0.0.1:8000/api/valuate", json=payload, headers=headers, timeout=300)
print("status", r.status_code, flush=True)
data = r.json()
if "detail" in data:
    print("error", json.dumps(data)[:500])
else:
    print("headline", (data.get("insights") or {}).get("headline", "?")[:150])
    print("listings", len(data.get("listings") or []))
    print("sold_stats", data.get("sold_stats"))
    print("asking_stats", data.get("asking_stats"))
    print("sources", json.dumps(data.get("source_status"), indent=2)[:2000])
    print("meta", data.get("meta"))
