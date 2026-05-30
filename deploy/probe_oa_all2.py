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
    if "/firearm-manufacturers" not in data:
        continue
    if "public/" in data and data.count("firearm-manufacturers") == data.count(
        "public/"
    ):
        pass
    paths = re.findall(r"apiBaseUrl\}/([a-zA-Z0-9/_-]+)", data)
    paths += re.findall(r'"/([a-zA-Z][a-zA-Z0-9/_-]*firearm[a-zA-Z0-9/_-]*)"', data)
    if paths:
        print(name, sorted(set(paths))[:20])
