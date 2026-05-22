"""Run single-item valuation across all adapters."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from mmd_engine.adapters.gunbroker import GunBrokerAdapter
from mmd_engine.adapters.sample_valuation import SampleValuationAdapter
from mmd_engine.adapters.truegunvalue import TrueGunValueAdapter
from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.adapters.wholesale_csv import wholesale_adapters
from mmd_engine.cache import load_cached, save_cached
from mmd_engine.insights import compute_insights
from mmd_engine.matching import apply_matching, canonical_key
from mmd_engine.stats import compute_stats, compute_trends
from mmd_engine.valuation_models import (
    ContextMode,
    FirearmQuery,
    ValuationResult,
)

logger = logging.getLogger(__name__)

DEFAULT_ADAPTERS: list[ValuationAdapter] = [
    SampleValuationAdapter(),
    GunBrokerAdapter(),
    TrueGunValueAdapter(),
]


def _all_adapters(*, include_live: bool) -> list[ValuationAdapter]:
    adapters: list[ValuationAdapter] = [SampleValuationAdapter()]
    if include_live:
        adapters.extend([GunBrokerAdapter(), TrueGunValueAdapter()])
    adapters.extend(wholesale_adapters())
    return adapters


def _fetch_adapter(adapter: ValuationAdapter, query: FirearmQuery) -> tuple[str, list, str]:
    try:
        rows = adapter.fetch(query)
        return adapter.name, rows, "ok"
    except Exception as exc:
        logger.warning("%s failed: %s", adapter.name, exc)
        return adapter.name, [], str(exc)


def run_valuation(
    query: FirearmQuery,
    *,
    context: ContextMode = "auction_sniper",
    my_cost: float | None = None,
    use_cache: bool = True,
    include_live: bool = True,
    sample_only: bool = False,
) -> ValuationResult:
    key = canonical_key(query)

    if use_cache and not sample_only:
        cached = load_cached(key)
        if cached:
            cached.context = context
            cached.insights = compute_insights(
                context=context,
                query=query,
                sold_stats=cached.sold_stats,
                asking_stats=cached.asking_stats,
                wholesale_stats=cached.wholesale_stats,
                my_cost=my_cost,
            )
            return cached

    adapters = [SampleValuationAdapter()] if sample_only else _all_adapters(include_live=include_live)
    all_listings = []
    source_status: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=min(6, len(adapters) or 1)) as pool:
        futures = {pool.submit(_fetch_adapter, a, query): a for a in adapters}
        for future in as_completed(futures):
            name, rows, status = future.result()
            source_status[name] = status
            all_listings.extend(rows)

    matched = apply_matching(all_listings, query)

    sold_stats = compute_stats(matched, "sold", days=90)
    asking_stats = compute_stats(matched, "asking", days=None)
    wholesale_stats = compute_stats(matched, "wholesale", days=None)
    estimate_stats = compute_stats(matched, "estimate", days=None)

    insights = compute_insights(
        context=context,
        query=query,
        sold_stats=sold_stats,
        asking_stats=asking_stats,
        wholesale_stats=wholesale_stats,
        my_cost=my_cost,
    )

    if my_cost is None and wholesale_stats.low > 0:
        insights.my_cost = wholesale_stats.low

    result = ValuationResult(
        query=query,
        context=context,
        canonical_key=key,
        sold_stats=sold_stats,
        asking_stats=asking_stats,
        wholesale_stats=wholesale_stats,
        estimate_stats=estimate_stats,
        listings=matched,
        insights=insights,
        trends=compute_trends(matched),
        source_status=source_status,
    )

    if not sample_only:
        save_cached(result)

    return result
