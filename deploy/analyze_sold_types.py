#!/usr/bin/env python3
import json
import statistics
from collections import Counter
from pathlib import Path

p = Path("/opt/modular-market-desk/engine/data/valuation_cache/handgun_browning_1911_380_any.json")
sold = [l for l in json.loads(p.read_text())["listings"] if l["price_type"] == "sold"]
types = Counter()
for l in sold:
    if "(" in l["title"]:
        types[l["title"].rsplit("(", 1)[-1].rstrip(")")] += 1
    else:
        types["?"] += 1
print("listing types", dict(types))
fixed = [l["price"] for l in sold if "Fixed" in l["title"]]
auction = [l["price"] for l in sold if "Auction" in l["title"]]
print("fixed n", len(fixed), "med", statistics.median(fixed) if fixed else None)
print("auction n", len(auction), "med", statistics.median(auction) if auction else None)
low = sorted(l["price"] for l in sold)
print("bottom 10 prices", low[:10])
print("median all", statistics.median(low))
