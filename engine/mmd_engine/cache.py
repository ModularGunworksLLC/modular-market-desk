"""Cache valuation results per canonical firearm key."""

from __future__ import annotations

import json
from pathlib import Path

from mmd_engine.config import ENGINE_ROOT
from mmd_engine.valuation_models import ValuationResult

CACHE_DIR = ENGINE_ROOT / "data" / "valuation_cache"
CACHE_TTL_HOURS = 24


def cache_path(canonical_key: str) -> Path:
    safe = canonical_key.replace("|", "_").replace("/", "-")[:120]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{safe}.json"


def load_cached(canonical_key: str) -> ValuationResult | None:
    path = cache_path(canonical_key)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        from mmd_engine.valuation_models import (
            FirearmQuery,
            MarketListing,
            PriceStats,
            TrendPoint,
            ValuationInsights,
        )

        query = FirearmQuery(**data["query"])
        listings = [MarketListing(**row) for row in data.get("listings", [])]
        return ValuationResult(
            query=query,
            context=data.get("context", "auction_sniper"),
            canonical_key=data.get("canonical_key", canonical_key),
            generated_at=data.get("generated_at", ""),
            sold_stats=PriceStats(**data.get("sold_stats", {})),
            sold_stats_sku=PriceStats(**data.get("sold_stats_sku", {})),
            sold_stats_all=PriceStats(**data.get("sold_stats_all", data.get("sold_stats", {}))),
            asking_stats=PriceStats(**data.get("asking_stats", {})),
            wholesale_stats=PriceStats(**data.get("wholesale_stats", {})),
            estimate_stats=PriceStats(**data.get("estimate_stats", {})),
            listings=listings,
            insights=ValuationInsights(**data.get("insights", {})),
            trends=[TrendPoint(**t) for t in data.get("trends", [])],
            source_status=data.get("source_status", {}),
        )
    except (json.JSONDecodeError, TypeError, KeyError):
        return None


def save_cached(result: ValuationResult) -> Path:
    path = cache_path(result.canonical_key)
    path.write_text(json.dumps(result.to_dict(), indent=2) + "\n", encoding="utf-8")
    return path
