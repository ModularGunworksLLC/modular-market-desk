#!/usr/bin/env python3
import json
import sys
from pathlib import Path

cache_dir = Path("/opt/modular-market-desk/engine/data/valuation_cache")
if len(sys.argv) > 1:
    p = Path(sys.argv[1])
else:
    files = sorted(cache_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    p = files[0] if files else None
if not p or not p.is_file():
    print("no cache file")
    sys.exit(1)

d = json.loads(p.read_text())
print("file:", p.name)
print("generated:", d.get("generated_at"))
print("context:", d.get("context"))
q = d.get("query", {})
print(
    "gun:",
    q.get("manufacturer"),
    q.get("model"),
    q.get("variant"),
    q.get("caliber"),
    q.get("condition"),
)
for k in ("sold_stats", "sold_stats_sku", "asking_stats"):
    s = d.get(k, {})
    if s.get("count"):
        print(
            f"{k}: n={s['count']} low={s['low']:.0f} p25={s['p25']:.0f} "
            f"med={s['median']:.0f} p75={s['p75']:.0f} high={s['high']:.0f}"
        )
ins = d.get("insights", {})
print("headline:", (ins.get("headline") or "")[:240])
print("max_bid:", ins.get("max_bid"))
print("my_cost:", ins.get("my_cost"))
brief = ins.get("dealer_brief") or {}
print("verdict:", brief.get("verdict"), "|", brief.get("verdict_reason"))
print("confidence:", brief.get("confidence"))
if brief.get("red_flags"):
    print("red_flags:", "; ".join(brief["red_flags"]))
m = brief.get("market") or {}
print("ask_vs_sold:", m.get("ask_vs_sold_label"))
c = brief.get("ceilings") or {}
print(
    "ceilings: sell",
    c.get("sell_assumption"),
    c.get("sell_price"),
    "max_pay",
    c.get("max_pay_all_in"),
    "max_hammer",
    c.get("max_hammer"),
)
print("sources:", d.get("source_status"))
print("listings:", len(d.get("listings", [])))
