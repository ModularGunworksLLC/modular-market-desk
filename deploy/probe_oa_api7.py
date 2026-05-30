import re
import urllib.request

CHUNKS = [
    "main-PXRBFLI2",
    "chunk-2MEVEF6E",
    "chunk-4TYIOR3A",
    "chunk-MTCZ57QJ",
    "chunk-KE6N7QO6",
    "chunk-42H2R35N",
    "chunk-JB5ZXKCE",
    "chunk-RSVEIYLE",
    "chunk-5LD5VOKC",
    "chunk-ZCKVQOCG",
    "chunk-VA4H7HLU",
]

for name in CHUNKS:
    try:
        data = urllib.request.urlopen(
            f"https://hub.outdooranalytics.com/{name}.js", timeout=30
        ).read().decode("utf-8", "ignore")
    except Exception:
        continue
    if "twelve-month" not in data and "pricing/dependencies" not in data:
        continue
    print(f"=== {name} ===")
    for needle in ["twelve-month-sales", "pricing/dependencies", "active-listing"]:
        idx = data.find(needle)
        if idx >= 0:
            print(data[max(0, idx - 150) : idx + 250])
