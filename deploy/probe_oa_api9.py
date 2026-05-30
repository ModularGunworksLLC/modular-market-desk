import re
import urllib.request

data = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/chunk-XLUXZVNV.js", timeout=60
).read().decode("utf-8", "ignore")

paths = sorted(set(re.findall(r'apiUrl\}/([a-zA-Z0-9/_-]+)', data)))
print("API paths:")
for p in paths:
    print(" ", p)

for needle in [
    "twelve-month-sales",
    "pricing/dependencies",
    "active-listing",
    "manufacturer",
    "modelId",
    "caliberId",
    "isUsed",
    "condition",
    "fairMarket",
    "expectedRange",
]:
    if needle in data:
        idx = data.find(needle)
        print(f"\n=== {needle} ===")
        print(data[idx : idx + 300])
