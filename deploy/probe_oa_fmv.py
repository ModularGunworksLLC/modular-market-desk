import re
import urllib.request

main = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/main-PXRBFLI2.js", timeout=30
).read().decode("utf-8", "ignore")
chunks = sorted(set(re.findall(r"chunk-[A-Z0-9]+\.js", main)))

for needle in ["fairMarket", "FairMarket", "fmv", "FMV", "expectedRange", "activeListing", "ActiveListing", "PricingTool", "pricing-tool"]:
    for chunk in chunks:
        name = chunk.replace(".js", "")
        try:
            data = urllib.request.urlopen(
                f"https://hub.outdooranalytics.com/{name}.js", timeout=20
            ).read().decode("utf-8", "ignore")
        except Exception:
            continue
        if needle in data:
            print(name, needle)
