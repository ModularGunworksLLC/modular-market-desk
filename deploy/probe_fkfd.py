import re
import urllib.request

data = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/chunk-FKFDYMYE.js", timeout=30
).read().decode("utf-8", "ignore")
print("len", len(data))

paths = sorted(set(re.findall(r"\$\{[^}]+\}/([a-zA-Z0-9/_-]+)", data)))
paths += sorted(set(re.findall(r'"/([a-zA-Z][a-zA-Z0-9/_-]{2,60})"', data)))
for p in sorted(set(paths)):
    if any(x in p.lower() for x in ("pric", "fire", "active", "model", "calib", "manuf", "depend", "month", "sales", "list")):
        print("PATH", p)

for needle in ["apiUrl", "apiBaseUrl", "activeListing", "pricing-tool", "dependencies", "manufacturer", "getPricing", "fetchPricing"]:
    if needle in data:
        start = 0
        while True:
            idx = data.find(needle, start)
            if idx < 0:
                break
            print(f"\n--- {needle} @ {idx} ---")
            print(data[max(0, idx - 120) : idx + 280])
            start = idx + len(needle)
            if start > idx + 5000:
                break
