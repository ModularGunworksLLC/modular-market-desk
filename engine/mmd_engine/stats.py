"""Aggregate price statistics from listings."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from mmd_engine.dates import parse_sold_date
from mmd_engine.matching import is_exact_sku_match
from mmd_engine.valuation_models import FirearmQuery, MarketListing, PriceStats, PriceType, TrendPoint

PENNY_AUCTION_MAX = 150.0


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * pct
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def _is_penny_auction(listing: MarketListing) -> bool:
    title = listing.title.lower()
    if listing.price <= PENNY_AUCTION_MAX and (
        "penny" in title or "0.01" in title or re.search(r"\$0\.0?1\b", title)
    ):
        return True
    return False


def _collect_prices(
    listings: list[MarketListing],
    price_type: PriceType,
    *,
    days: int | None = 90,
    condition_filter: str | None = None,
    sku_only: bool = False,
    query: FirearmQuery | None = None,
) -> list[float]:
    prices: list[float] = []
    cutoff = None
    if days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    for listing in listings:
        if not listing.included_in_stats or listing.price_type != price_type:
            continue
        if _is_penny_auction(listing):
            continue
        if sku_only and query and not is_exact_sku_match(listing, query):
            continue
        if condition_filter and listing.condition:
            if condition_filter.lower() not in listing.condition.lower():
                continue
        if cutoff:
            sold = parse_sold_date(listing.date)
            if sold is None and listing.scraped_at:
                sold = parse_sold_date(listing.scraped_at)
            if sold is not None and sold < cutoff:
                continue
        if listing.price > 0:
            prices.append(listing.price)
    return prices


def compute_stats(
    listings: list[MarketListing],
    price_type: PriceType,
    *,
    days: int | None = 90,
    condition_filter: str | None = None,
) -> PriceStats:
    prices = _collect_prices(
        listings,
        price_type,
        days=days,
        condition_filter=condition_filter,
    )
    if not prices:
        return PriceStats()

    return PriceStats(
        count=len(prices),
        low=min(prices),
        high=max(prices),
        median=_percentile(prices, 0.5),
        p25=_percentile(prices, 0.25),
        p75=_percentile(prices, 0.75),
        avg=sum(prices) / len(prices),
    )


def compute_sku_stats(
    listings: list[MarketListing],
    query: FirearmQuery,
    price_type: PriceType,
    *,
    days: int | None = 90,
) -> PriceStats:
    """Stats for listings matching UPC or MPN exactly."""
    if not query.upc and not query.mpn:
        return PriceStats()
    cond = query.condition if query.condition in {"new", "used"} else None
    prices = _collect_prices(
        listings,
        price_type,
        days=days,
        condition_filter=cond,
        sku_only=True,
        query=query,
    )
    if not prices:
        return PriceStats()
    return PriceStats(
        count=len(prices),
        low=min(prices),
        high=max(prices),
        median=_percentile(prices, 0.5),
        p25=_percentile(prices, 0.25),
        p75=_percentile(prices, 0.75),
        avg=sum(prices) / len(prices),
    )


def compute_trends(
    listings: list[MarketListing],
    *,
    months: int = 12,
) -> list[TrendPoint]:
    buckets: dict[str, list[float]] = {}
    for listing in listings:
        if not listing.included_in_stats or listing.price_type != "sold":
            continue
        if _is_penny_auction(listing):
            continue
        if not listing.date or listing.price <= 0:
            continue
        try:
            dt = parse_sold_date(listing.date) or parse_sold_date(listing.scraped_at)
            if not dt:
                continue
            key = dt.strftime("%Y-%m")
            buckets.setdefault(key, []).append(listing.price)
        except ValueError:
            continue

    points: list[TrendPoint] = []
    for month in sorted(buckets.keys())[-months:]:
        vals = buckets[month]
        points.append(
            TrendPoint(
                month=month,
                avg_price=sum(vals) / len(vals),
                count=len(vals),
            )
        )
    return points


def primary_sold_stats(
    listings: list[MarketListing],
    query: FirearmQuery,
    *,
    days: int = 90,
) -> tuple[PriceStats, PriceStats, str]:
    """
    Return (primary, family, label).
    Prefer exact SKU stats when UPC/MPN provided and matches exist.
    """
    sku = compute_sku_stats(listings, query, "sold", days=days)
    family = compute_stats(listings, "sold", days=days)
    if sku.count > 0:
        return sku, family, "Exact SKU (90d)"
    return family, family, "Sold (90d)"
