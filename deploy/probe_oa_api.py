"""Probe Outdoor Analytics hub JS bundles for API base URLs and paths."""
import re
import urllib.request

CHUNKS = [
    "main-PXRBFLI2",
    "chunk-KE6N7QO6",
    "chunk-42H2R35N",
    "chunk-RSVEIYLE",
    "chunk-ZCKVQOCG",
    "chunk-4TYIOR3A",
    "chunk-VA4H7HLU",
    "chunk-5LD5VOKC",
]

for name in CHUNKS:
    url = f"https://hub.outdooranalytics.com/{name}.js"
    try:
        data = urllib.request.urlopen(url, timeout=30).read().decode("utf-8", "ignore")
    except Exception as exc:
        print(f"=== {name} FAIL {exc}")
        continue
    urls = set(re.findall(r"https?://[a-zA-Z0-9._/-]+", data))
    apis = [u for u in urls if any(x in u.lower() for x in ("api", "nics", "analytics", "gunbroker"))]
    paths = set(re.findall(r'["\'](/[a-zA-Z][a-zA-Z0-9_/-]{3,80})["\']', data))
    interesting = [
        p
        for p in paths
        if any(x in p.lower() for x in ("pric", "fire", "gun", "model", "mfr", "calib", "trend", "listing", "catalog"))
    ]
    print(f"=== {name} ({len(data)} bytes) ===")
    for u in sorted(apis)[:20]:
        print("  URL", u)
    for p in sorted(interesting)[:25]:
        print("  PATH", p)
    # bare hostnames
    hosts = set(re.findall(r"[a-z][a-z0-9-]+\.(?:outdooranalytics|gunbrokeranalytics)\.com", data))
    for h in sorted(hosts):
        print("  HOST", h)
