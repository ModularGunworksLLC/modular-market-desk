"""Run a live valuation on this machine (home IP) and save to valuation_cache."""

from __future__ import annotations

import argparse
import json
import sys

from mmd_engine.cache import cache_path, save_cached
from mmd_engine.matching import canonical_key
from mmd_engine.service.valuation import run_valuation
from mmd_engine.valuation_models import FirearmQuery


def main() -> None:
    parser = argparse.ArgumentParser(description="Live valuate locally (for cache sync to server)")
    parser.add_argument("--manufacturer", default="Glock")
    parser.add_argument("--model", default="30")
    parser.add_argument("--variant", default="Gen 5")
    parser.add_argument("--caliber", default="45 ACP")
    parser.add_argument("--category", default="handgun")
    parser.add_argument("--condition", default="used")
    parser.add_argument("--context", default="auction_sniper")
    parser.add_argument("--buyer-premium", type=float, default=18.0)
    parser.add_argument("--listing-addons", type=float, default=10.0)
    args = parser.parse_args()

    query = FirearmQuery(
        category=args.category,
        manufacturer=args.manufacturer,
        model=args.model,
        variant=args.variant,
        caliber=args.caliber,
        condition=args.condition,
    )
    key = canonical_key(query)
    print(f"Canonical key: {key}", flush=True)
    print("Running live valuation (TrueGunValue, GunBroker, Gun.deals)...", flush=True)

    result = run_valuation(
        query,
        context=args.context,  # type: ignore[arg-type]
        buyer_premium_pct=args.buyer_premium,
        listing_addons=args.listing_addons,
        sample_only=False,
        force_refresh=True,
        use_cache=False,
    )
    path = save_cached(result)
    sold = result.sold_stats.count
    asking = result.asking_stats.count
    print(f"Saved: {path}", flush=True)
    print(f"Listings: {len(result.listings)} (sold comps: {sold}, asking: {asking})", flush=True)
    print(f"Headline: {result.insights.headline}", flush=True)
    print("Sources:", json.dumps(result.source_status, indent=2), flush=True)

    if len(result.listings) == 0:
        print(
            "WARNING: 0 listings — sites may be blocked or login required.",
            file=sys.stderr,
        )
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
