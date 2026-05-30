import re
import urllib.request

data = urllib.request.urlopen(
    "https://hub.outdooranalytics.com/chunk-KE6N7QO6.js", timeout=30
).read().decode("utf-8", "ignore")
# apiUrl assignments
for m in re.finditer(r"apiUrl[^,]{0,120}", data):
    print(m.group(0)[:120])
print("---")
for m in re.finditer(r"https://[a-z0-9.-]+\.(outdooranalytics|gunbrokeranalytics)\.com[a-zA-Z0-9/_-]*", data):
    print(m.group(0))
