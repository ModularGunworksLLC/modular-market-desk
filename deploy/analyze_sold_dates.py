#!/usr/bin/env python3
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from mmd_engine.dates import parse_sold_date

p = Path("/opt/modular-market-desk/engine/data/valuation_cache/handgun_browning_1911_380_any.json")
d = json.loads(p.read_text())
sold = [l for l in d["listings"] if l["price_type"] == "sold"]
cutoff = datetime.now(timezone.utc) - timedelta(days=90)
in90 = []
out90 = []
for l in sold:
    dt = parse_sold_date(l.get("date") or "") or parse_sold_date(l.get("scraped_at") or "")
    if dt and dt >= cutoff:
        in90.append(l["price"])
    else:
        out90.append((l.get("date"), l["price"]))

print("sold total", len(sold))
print("in 90d", len(in90), "prices", sorted(in90))
if in90:
  import statistics
  print("90d median", statistics.median(in90))
print("outside 90d", len(out90))
for dte, pr in sorted(out90, key=lambda x: x[1])[:10]:
  print("  old", dte, pr)

all_prices = sorted(l["price"] for l in sold)
import statistics
print("all-time median", statistics.median(all_prices))
print("all-time mean", statistics.mean(all_prices))
# trimmed mean drop top/bottom 10%
if len(all_prices) >= 5:
    trim = all_prices[1:-1] if len(all_prices) > 2 else all_prices
    print("trimmed-ish median", statistics.median(trim))
