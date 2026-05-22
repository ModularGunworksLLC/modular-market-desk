"""Aggregate price statistics from listings."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from mmd_engine.valuation_models import MarketListing, PriceStats, PriceType, TrendPoint


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


def compute_stats(
    listings: list[MarketListing],
    price_type: PriceType,
    *,
    days: int | None = 90,
    condition_filter: str | None = None,
) -> PriceStats:
    prices: list[float] = []
    cutoff = None
    if days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    for listing in listings:
        if not listing.included_in_stats or listing.price_type != price_type:
            continue
        if condition_filter and listing.condition:
            if condition_filter.lower() not in listing.condition.lower():
                continue
        if cutoff and listing.date:
            try:
                sold = datetime.fromisoformat(listing.date.replace("Z", "+00:00"))
                if sold.tzinfo is None:
                    sold = sold.replace(tzinfo=timezone.utc)
                if sold < cutoff:
                    continue
            except ValueError:
                pass
        if listing.price > 0:
            prices.append(listing.price)

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
        if not listing.date or listing.price <= 0:
            continue
        try:
            dt = datetime.fromisoformat(listing.date.replace("Z", "+00:00"))
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
