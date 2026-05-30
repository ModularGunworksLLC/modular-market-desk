import re
import urllib.request

main = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/main-PXRBFLI2.js", timeout=30
).read().decode("utf-8", "ignore")
chunks = sorted(set(re.findall(r"chunk-[A-Z0-9]+\.js", main)))
print("chunks in main:", len(chunks))

for name in chunks:
    name = name.replace(".js", "")
    try:
        data = urllib.request.urlopen(
            f"https://hub.outdooranalytics.com/{name}.js", timeout=30
        ).read().decode("utf-8", "ignore")
    except Exception as exc:
        print(name, "FAIL", exc)
        continue
    if "twelve-month" in data or "dependencies" in data and "pricing" in data:
        print("HIT", name, len(data))
        for m in re.finditer(r".{0,60}twelve-month-sales.{0,120}", data):
            print(m.group(0)[:180])
