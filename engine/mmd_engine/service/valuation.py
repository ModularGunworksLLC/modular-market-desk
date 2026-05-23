"""Run single-item valuation across all adapters."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.cache import load_cached, save_cached
from mmd_engine.insights import compute_insights
from mmd_engine.config import scrape_serial
from mmd_engine.market_sources import all_valuation_adapters, live_market_adapters
from mmd_engine.matching import apply_matching, canonical_key
from mmd_engine.stats import (
    compute_stats,
    compute_sku_stats,
    compute_trends,
    primary_sold_stats,
)
from mmd_engine.valuation_models import (
    ContextMode,
    FirearmQuery,
    ValuationResult,
)

logger = logging.getLogger(__name__)


def _fetch_adapter(adapter: ValuationAdapter, query: FirearmQuery) -> tuple[str, list, str]:
    try:
        rows = adapter.fetch(query)
        if not rows:
            hint = ""
            if adapter.name in {"gunbroker", "gundeals"}:
                hint = " — try: python -m mmd_engine.cli.market_auth " + adapter.name
            return adapter.name, [], f"blocked or empty (0 listings){hint}"
        sold = sum(1 for r in rows if r.price_type == "sold")
        asking = sum(1 for r in rows if r.price_type == "asking")
        est = sum(1 for r in rows if r.price_type == "estimate")
        parts = [f"{len(rows)} raw"]
        if sold:
            parts.append(f"{sold} sold")
        if asking:
            parts.append(f"{asking} asking")
        if est:
            parts.append(f"{est} est")
        return adapter.name, rows, "ok (" + ", ".join(parts) + ")"
    except Exception as exc:
        logger.warning("%s failed: %s", adapter.name, exc)
        return adapter.name, [], str(exc)


def _finalize_result(
    *,
    query: FirearmQuery,
    context: ContextMode,
    key: str,
    matched: list,
    source_status: dict[str, str],
    my_cost: float | None,
    street_retail: float | None,
    reference_msrp: float | None,
    buyer_premium_pct: float | None,
    listing_addons: float | None,
) -> ValuationResult:
    primary, family, sold_label = primary_sold_stats(matched, query, days=90)
    sold_stats_sku = compute_sku_stats(matched, query, "sold", days=90)
    sold_stats = primary if primary.count else family
    asking_stats = compute_stats(matched, "asking", days=None)
    wholesale_stats = compute_stats(matched, "wholesale", days=None)
    estimate_stats = compute_stats(matched, "estimate", days=None)

    insights = compute_insights(
        context=context,
        query=query,
        sold_stats=family,
        sold_stats_sku=sold_stats_sku,
        sold_label=sold_label,
        asking_stats=asking_stats,
        wholesale_stats=wholesale_stats,
        estimate_stats=estimate_stats,
        my_cost=my_cost,
        street_retail=street_retail,
        reference_msrp=reference_msrp,
        buyer_premium_pct=buyer_premium_pct,
        listing_addons=listing_addons,
    )
    insights.assumptions["sources_queried"] = list(source_status.keys())
    insights.assumptions["sources_status"] = dict(source_status)

    if my_cost is None and wholesale_stats.low > 0:
        insights.my_cost = wholesale_stats.low

    return ValuationResult(
        query=query,
        context=context,
        canonical_key=key,
        sold_stats=sold_stats,
        sold_stats_sku=sold_stats_sku,
        sold_stats_all=family,
        asking_stats=asking_stats,
        wholesale_stats=wholesale_stats,
        estimate_stats=estimate_stats,
        listings=matched,
        insights=insights,
        trends=compute_trends(matched),
        source_status=source_status,
    )


def run_valuation(
    query: FirearmQuery,
    *,
    context: ContextMode = "auction_sniper",
    my_cost: float | None = None,
    street_retail: float | None = None,
    reference_msrp: float | None = None,
    buyer_premium_pct: float | None = None,
    listing_addons: float | None = None,
    use_cache: bool = False,
    force_refresh: bool = False,
    include_live: bool = True,
    sample_only: bool = False,
) -> ValuationResult:
    key = canonical_key(query)

    if use_cache and not sample_only and not force_refresh:
        cached = load_cached(key)
        if cached and len(cached.listings) > 0:
            rematched = apply_matching(cached.listings, query)
            primary, _, _ = primary_sold_stats(rematched, query, days=90)
            asking = compute_stats(rematched, "asking", days=None)
            est = compute_stats(rematched, "estimate", days=None)
            if primary.count > 0 or asking.count > 0 or est.count > 0:
                return _finalize_result(
                    query=query,
                    context=context,
                    key=key,
                    matched=rematched,
                    source_status=cached.source_status,
                    my_cost=my_cost,
                    street_retail=street_retail,
                    reference_msrp=reference_msrp,
                    buyer_premium_pct=buyer_premium_pct,
                    listing_addons=listing_addons,
                )

    adapters = all_valuation_adapters(sample_only=sample_only)
    all_listings: list = []
    source_status: dict[str, str] = {}

    live_names = {a.name for a in live_market_adapters()}
    if scrape_serial() and not sample_only:
        wholesale = [a for a in adapters if a.name not in live_names]
        live = [a for a in adapters if a.name in live_names]
        for adapter in live:
            name, rows, status = _fetch_adapter(adapter, query)
            source_status[name] = status
            all_listings.extend(rows)
        adapters = wholesale

    with ThreadPoolExecutor(max_workers=min(6, len(adapters) or 1)) as pool:
        futures = {pool.submit(_fetch_adapter, a, query): a for a in adapters}
        for future in as_completed(futures):
            name, rows, status = future.result()
            source_status[name] = status
            all_listings.extend(rows)

    matched = apply_matching(all_listings, query)
    result = _finalize_result(
        query=query,
        context=context,
        key=key,
        matched=matched,
        source_status=source_status,
        my_cost=my_cost,
        street_retail=street_retail,
        reference_msrp=reference_msrp,
        buyer_premium_pct=buyer_premium_pct,
        listing_addons=listing_addons,
    )

    if not sample_only:
        save_cached(result)

    return result
