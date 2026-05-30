import re
import urllib.request

for name in ["main-PXRBFLI2", "chunk-KE6N7QO6", "chunk-4TYIOR3A", "chunk-42H2R35N"]:
    data = urllib.request.urlopen(
        f"https://hub.outdooranalytics.com/{name}.js", timeout=30
    ).read().decode("utf-8", "ignore")
    for needle in [
        "firearm-manufacturers",
        "apiUrl",
        "baseUrl",
        "BASE_URL",
        "environment",
        "nics.",
        "hub.",
    ]:
        idx = data.find(needle)
        if idx >= 0:
            print(f"\n{name} @ {needle}:")
            print(data[max(0, idx - 80) : idx + 120])
