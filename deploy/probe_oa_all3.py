import re
import urllib.request

main = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/main-PXRBFLI2.js", timeout=30
).read().decode("utf-8", "ignore")
chunks = sorted(set(re.findall(r"chunk-[A-Z0-9]+\.js", main)))

for chunk in chunks:
    name = chunk.replace(".js", "")
    try:
        data = urllib.request.urlopen(
            f"https://hub.outdooranalytics.com/{name}.js", timeout=30
        ).read().decode("utf-8", "ignore")
    except Exception:
        continue
    if "firearm-manufacturers" not in data:
        continue
    print(f"\n=== {name} ===")
    for m in re.finditer(r"firearm-[a-z-]+", data):
        s = m.group(0)
        if s not in ("firearm-manufacturers", "firearm-calibers", "firearm-categories"):
            continue
    for path in sorted(set(re.findall(r"/[a-z][a-z0-9/-]*(?:firearm|pricing|active|twelve)[a-z0-9/-]*", data))):
        if len(path) < 60:
            print(" ", path)
    idx = data.find("firearm-manufacturers")
    if idx >= 0:
        snippet = data[max(0, idx - 250) : idx + 350]
        if ".get(" in snippet or "http" in snippet:
            print(" SNIP", snippet[:500])
