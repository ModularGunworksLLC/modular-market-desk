import json
import httpx
from mmd_engine.config import api_key

payload = {
    "category": "handgun",
    "manufacturer": "Glock",
    "model": "30",
    "variant": "Gen 5",
    "caliber": "45 ACP",
    "context": "auction_sniper",
    "sample_only": True,
}
headers = {"X-API-Key": api_key()}
r = httpx.post("http://127.0.0.1:8000/api/valuate", json=payload, headers=headers, timeout=90)
print("status", r.status_code)
data = r.json()
if "detail" in data:
    print("error", data)
else:
    print("headline", (data.get("insights") or {}).get("headline", "?")[:120])
    print("listings", len(data.get("listings") or []))
    print("sources", data.get("source_status"))
