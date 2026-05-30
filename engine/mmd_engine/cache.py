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


def _cache_key_candidates(canonical_key: str) -> list[str]:
    """Exact key first, then relax condition (Any vs used share the same comps)."""
    keys = [canonical_key]
    parts = [p for p in canonical_key.split("|") if p]
    if len(parts) >= 2:
        cond = parts[-1]
        base = "|".join(parts[:-1])
        if cond == "any":
            keys.append(f"{base}|used")
        elif cond == "used":
            keys.append(f"{base}|any")
    seen: set[str] = set()
    out: list[str] = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def load_cached(canonical_key: str) -> ValuationResult | None:
    for key in _cache_key_candidates(canonical_key):
        hit = _load_cached_file(key)
        if hit is not None and len(hit.listings) > 0:
            return hit
    return None


def _load_cached_file(canonical_key: str) -> ValuationResult | None:
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
