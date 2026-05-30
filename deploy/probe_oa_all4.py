import re
import urllib.request

main = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/main-PXRBFLI2.js", timeout=30
).read().decode("utf-8", "ignore")
chunks = sorted(set(re.findall(r"chunk-[A-Z0-9]+\.js", main)))

needles = ["pricing/dependencies", "twelve-month-sales", "active-listing", "firearm-manufacturers"]

for chunk in chunks:
    name = chunk.replace(".js", "")
    try:
        data = urllib.request.urlopen(
            f"https://hub.outdooranalytics.com/{name}.js", timeout=30
        ).read().decode("utf-8", "ignore")
    except Exception:
        continue
    for needle in needles:
        if needle not in data:
            continue
        idx = data.find(needle)
        snip = data[max(0, idx - 300) : idx + 400]
        if ".get(" in snip or "post(" in snip.lower() or "HttpClient" in snip:
            print(f"\n=== {name} :: {needle} ===")
            print(snip[:700])

# apiBaseUrl in UI6SVOXJ
data = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/chunk-UI6SVOXJ.js", timeout=30
).read().decode("utf-8", "ignore")
for m in re.finditer(r"apiBaseUrl.{0,100}", data):
    print("BASE", m.group(0)[:100])
paths = sorted(set(re.findall(r"\$\{this\.apiBaseUrl\}/([a-zA-Z0-9/_-]+)", data)))
print("paths", len(paths))
for p in paths:
    print(" ", p)
