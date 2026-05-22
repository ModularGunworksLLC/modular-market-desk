"""Orchestrate market + dealer adapters into one bundle."""

from __future__ import annotations

import logging
from typing import Iterable

from mmd_engine.adapters.base import DealerAdapter, MarketAdapter
from mmd_engine.adapters.gundeals import GunDealsAdapter
from mmd_engine.adapters.lipseys import LipseysAdapter
from mmd_engine.adapters.sample import SampleMarketAdapter
from mmd_engine.adapters.zanders import ZandersAdapter
from mmd_engine.filters import SearchFilters, apply_filters
from mmd_engine.models import CatalogItem, CompItem, DataBundle, utc_now_iso

logger = logging.getLogger(__name__)

DEFAULT_MARKET: list[MarketAdapter] = [
    SampleMarketAdapter(),
    GunDealsAdapter(),
]

DEFAULT_DEALERS: list[DealerAdapter] = [
    LipseysAdapter(),
    ZandersAdapter(),
]


def _merge_catalog(items: Iterable[CatalogItem]) -> list[CatalogItem]:
    by_id: dict[str, CatalogItem] = {}
    for item in items:
        by_id[item.id] = item
    return list(by_id.values())


def _merge_comps(items: Iterable[CompItem]) -> list[CompItem]:
    seen: set[str] = set()
    merged: list[CompItem] = []
    for comp in items:
        if comp.id in seen:
            continue
        seen.add(comp.id)
        merged.append(comp)
    return merged


def run_search(
    query: str,
    *,
    filters: SearchFilters | None = None,
    include_sample: bool = True,
    include_market: bool = True,
    include_dealers: bool = True,
) -> DataBundle:
    filters = filters or SearchFilters(query=query)
    catalog: list[CatalogItem] = []
    comps: list[CompItem] = []

    market_adapters: list[MarketAdapter] = []
    if include_sample:
        market_adapters.append(SampleMarketAdapter())
    if include_market:
        market_adapters.extend(a for a in DEFAULT_MARKET if a.name != "sample")

    for adapter in market_adapters:
        try:
            cat, cmp = adapter.search(query)
            catalog.extend(cat)
            comps.extend(cmp)
            logger.info("%s: %d catalog, %d comps", adapter.name, len(cat), len(cmp))
        except Exception as exc:
            logger.warning("%s failed: %s", adapter.name, exc)

    if include_dealers:
        for adapter in DEFAULT_DEALERS:
            try:
                rows = adapter.search(query)
                catalog.extend(rows)
                logger.info("%s: %d catalog rows", adapter.name, len(rows))
            except Exception as exc:
                logger.warning("%s failed: %s", adapter.name, exc)

    bundle = DataBundle(
        catalog=_merge_catalog(catalog),
        comps=_merge_comps(comps),
        generated_at=utc_now_iso(),
    )
    return apply_filters(bundle, filters)
