#!/usr/bin/env python3
"""Analyze OA cache vs hub expectations for Browning 1911-380."""
import json
from pathlib import Path

from mmd_engine.matching import apply_matching, score_listing
from mmd_engine.valuation_models import FirearmQuery, MarketListing
from mmd_engine.stats import compute_stats

p = Path("/opt/modular-market-desk/engine/data/valuation_cache/handgun_browning_1911_380_any.json")
d = json.loads(p.read_text())

queries = [
    ("hub_like", FirearmQuery(manufacturer="BROWNING", model="1911-380", caliber=".380 ACP", condition="used")),
    ("desk_1911", FirearmQuery(manufacturer="BROWNING", model="1911", caliber="380", condition="any")),
    ("desk_arms", FirearmQuery(manufacturer="BROWNING", model="1911", variant="ARMS CO", caliber="380", condition="any")),
]

raw = d["listings"]
sold_raw = [l for l in raw if l["price_type"] == "sold"]
ask_raw = [l for l in raw if l["price_type"] == "asking"]
print("raw sold", len(sold_raw), "raw asking", len(ask_raw))

for label, q in queries:
    listings = [
        MarketListing(**{**l, "match_score": 0.0, "included_in_stats": True})
        for l in raw
    ]
    matched = apply_matching(listings, q)
    sold = [l for l in matched if l.price_type == "sold" and l.included_in_stats]
    asking = [l for l in matched if l.price_type == "asking" and l.included_in_stats]
    stats = compute_stats(matched, "sold", days=90)
    ask = compute_stats(matched, "asking", days=None)
    print(f"\n=== {label} ===")
    print("query:", q.manufacturer, q.model, q.variant, q.caliber, q.condition)
    print(f"sold matched {len(sold)}/{len(sold_raw)} stats90d n={stats.count} med={stats.median:.0f} p25={stats.p25:.0f} p75={stats.p75:.0f}")
    print(f"asking matched {len(asking)}/{len(ask_raw)} med={ask.median:.0f}")
    if sold:
        print("sample sold title:", sold[0].title[:80])
        print("sample sold score:", sold[0].match_score)

# Show sold prices distribution from API (no matching)
prices = sorted([l["price"] for l in sold_raw])
if prices:
    import statistics
    print("\n=== ALL raw sold (no matching) ===")
    print("n=", len(prices), "min", prices[0], "med", statistics.median(prices), "max", prices[-1])
