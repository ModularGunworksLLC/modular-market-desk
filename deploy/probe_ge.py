import re
import urllib.request

# FKFDYMYE imports ge from somewhere - find ge service chunk
for chunk in ["chunk-FKFDYMYE", "chunk-4GDQ52NJ", "chunk-C3UFBFTA", "chunk-E2H4JWIK", "chunk-W65423UR"]:
    data = urllib.request.urlopen(
        f"https://hub.outdooranalytics.com/{chunk}.js", timeout=30
    ).read().decode("utf-8", "ignore")
    if "getPricingDependencies" in data or "getPricingData" in data:
        print("in", chunk)
        idx = data.find("getPricingDependencies")
        if idx < 0:
            idx = data.find("getPricingData")
        print(data[max(0, idx - 100) : idx + 600])

main = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/main-PXRBFLI2.js", timeout=30
).read().decode("utf-8", "ignore")
# FKFDYMYE imports: O(ge) - find from chunk
import re
m = re.search(r'chunk-FKFDYMYE\.js";import\{[^}]+\}from"\./(chunk-[A-Z0-9]+)\.js"', main)
if m:
    print("FKFDYMYE imports from", m.group(1))

# search all chunks for getPricingDependencies definition
main_chunks = sorted(set(re.findall(r"chunk-[A-Z0-9]+\.js", main)))
for name in main_chunks:
    name = name.replace(".js", "")
    try:
        data = urllib.request.urlopen(
            f"https://hub.outdooranalytics.com/{name}.js", timeout=20
        ).read().decode("utf-8", "ignore")
    except Exception:
        continue
    if "getPricingDependencies()" in data or "getPricingDependencies(" in data:
        if "getPricingDependencies().subscribe" not in data:
            print("DEF", name)
            idx = data.find("getPricingDependencies")
            print(data[idx : idx + 800])
