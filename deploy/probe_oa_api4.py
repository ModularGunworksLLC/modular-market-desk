import re
import urllib.request

data = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/chunk-JB5ZXKCE.js", timeout=30
).read().decode("utf-8", "ignore")
print("size", len(data))
for m in re.finditer(r"apiUrl.{0,80}", data):
    print(m.group(0))
print("--- urls ---")
for u in sorted(set(re.findall(r"https://[a-zA-Z0-9._/-]+", data))):
    print(u)
