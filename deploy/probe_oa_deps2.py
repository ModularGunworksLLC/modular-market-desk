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
    if "dependencies" not in data or "Pricing" not in data and "pricing" not in data:
        continue
    if "apiUrl" not in data and "apiBaseUrl" not in data:
        continue
    paths = re.findall(r"\$\{[^}]+\}/([a-zA-Z0-9][a-zA-Z0-9/_-]{2,60})", data)
    pr = [p for p in paths if "pric" in p or "fire" in p or "active" in p or "model" in p or "calib" in p]
    if pr:
        print(name, sorted(set(pr))[:25])
