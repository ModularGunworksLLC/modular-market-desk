import re
import urllib.request

for name in [
    "chunk-E2H4JWIK",
    "chunk-W65423UR",
    "chunk-C3UFBFTA",
    "chunk-FKFDYMYE",
    "chunk-35AH27TK",
    "chunk-4GDQ52NJ",
    "chunk-GBX4GOHQ",
]:
    data = urllib.request.urlopen(
        f"https://hub.outdooranalytics.com/{name}.js", timeout=30
    ).read().decode("utf-8", "ignore")
    if "twelve-month" not in data and "active-listing" not in data:
        continue
    print(f"\n======== {name} ========")
    for m in re.finditer(r".{0,80}twelve-month-sales.{0,120}", data):
        print(m.group(0))
    for m in re.finditer(r".{0,80}pricing/dependencies.{0,120}", data):
        print(m.group(0))
    for m in re.finditer(r".{0,40}\.get\([^)]{0,200}", data):
        s = m.group(0)
        if "pric" in s or "fire" in s or "list" in s or "month" in s:
            print("GET", s[:200])
