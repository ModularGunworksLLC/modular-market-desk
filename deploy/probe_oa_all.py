import re
import urllib.request

main = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/main-PXRBFLI2.js", timeout=30
).read().decode("utf-8", "ignore")
chunks = sorted(set(re.findall(r"chunk-[A-Z0-9]+\.js", main)))

hits = []
for chunk in chunks:
    name = chunk.replace(".js", "")
    try:
        data = urllib.request.urlopen(
            f"https://hub.outdooranalytics.com/{name}.js", timeout=30
        ).read().decode("utf-8", "ignore")
    except Exception:
        continue
    if "firearm-manufacturers" in data and ".get(" in data:
        hits.append(name)

print("chunks with firearm-manufacturers + get:", hits)
for name in hits[:5]:
    data = urllib.request.urlopen(
        f"https://hub.outdooranalytics.com/{name}.js", timeout=30
    ).read().decode("utf-8", "ignore")
    print(f"\n=== {name} ===")
    idx = data.find("firearm-manufacturers")
    print(data[max(0, idx - 200) : idx + 400])
