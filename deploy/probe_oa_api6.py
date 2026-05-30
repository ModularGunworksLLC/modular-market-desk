import re
import urllib.request

data = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/main-PXRBFLI2.js", timeout=30
).read().decode("utf-8", "ignore")

for needle in [
    "twelve-month-sales",
    "pricing/dependencies",
    "active-listing",
    "fairMarket",
    "FairMarket",
    "manufacturerId",
    "modelId",
    "caliberId",
    "isUsed",
    "isNew",
]:
    idx = 0
    while True:
        idx = data.find(needle, idx)
        if idx < 0:
            break
        print(f"\n--- {needle} @ {idx} ---")
        print(data[max(0, idx - 100) : idx + 150])
        idx += len(needle)
