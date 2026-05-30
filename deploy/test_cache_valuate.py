import httpx
from mmd_engine.config import api_key

payload = {
    "category": "handgun",
    "manufacturer": "Glock",
    "model": "30",
    "variant": "Gen 5",
    "caliber": "45 ACP",
    "condition": "any",
    "context": "auction_sniper",
    "sample_only": False,
    "use_cache": True,
    "force_refresh": False,
}
r = httpx.post(
    "http://127.0.0.1:8000/api/valuate",
    json=payload,
    headers={"X-API-Key": api_key()},
    timeout=60,
)
print("status", r.status_code)
d = r.json()
print("listings", len(d.get("listings", [])))
print("headline", (d.get("insights") or {}).get("headline", "?")[:100])
print("sources", d.get("source_status"))
