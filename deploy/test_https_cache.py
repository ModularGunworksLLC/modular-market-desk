import httpx

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
    "https://api.modulargunworks.com/api/valuate",
    json=payload,
    headers={"X-API-Key": "660edd10e6b6a4d13dc6b807deafb99b0e481bb8e9b0a219"},
    timeout=60,
)
print("status", r.status_code)
d = r.json()
print("listings", len(d.get("listings", [])))
print("headline", (d.get("insights") or {}).get("headline", "?")[:90])
