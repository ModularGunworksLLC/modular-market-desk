import re
import urllib.request

BASE = "https://api.gunbrokeranalytics.com/gba-portal-api"

for name in ["main-PXRBFLI2", "chunk-4TYIOR3A", "chunk-RSVEIYLE"]:
    data = urllib.request.urlopen(
        f"https://hub.outdooranalytics.com/{name}.js", timeout=30
    ).read().decode("utf-8", "ignore")
    paths = set(re.findall(rf"\$\{{[^}}]+\}}/([a-zA-Z0-9/_-]+)", data))
    paths |= set(re.findall(r'apiUrl\}/([a-zA-Z0-9/_-]+)', data))
    paths |= set(re.findall(r'"/([a-zA-Z][a-zA-Z0-9/_-]{2,50})"', data))
    rel = [p for p in paths if any(x in p for x in ("pric", "fire", "list", "trend", "month", "active", "catalog", "model"))]
    if rel:
        print(f"=== {name} ===")
        for p in sorted(rel):
            print(" ", p)

# unauthenticated probe
for path in [
    "/firearm-manufacturers",
    "/firearm-calibers",
    "/firearm-categories",
    "/pricing/dependencies",
    "/active-listing",
    "/pricing",
]:
    url = BASE + path
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read()[:400]
            print(f"{path} -> {resp.status} {body[:200]}")
    except Exception as exc:
        print(f"{path} -> ERR {exc}")
