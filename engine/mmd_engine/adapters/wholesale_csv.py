"""Wholesale listings from imported CSV inventory files."""

from __future__ import annotations

import logging

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.csv.store import list_inventory_sources, load_inventory
from mmd_engine.models import utc_now_iso
from mmd_engine.util import matches_query, slug_id
from mmd_engine.valuation_models import FirearmQuery, MarketListing

logger = logging.getLogger(__name__)


class WholesaleCsvAdapter(ValuationAdapter):
    def __init__(self, source: str) -> None:
        self.name = f"wholesale-{source}"

    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        items = load_inventory(self.name.removeprefix("wholesale-"))
        if not items:
            return []

        q = query.search_text()
        now = utc_now_iso()
        rows: list[MarketListing] = []

        for item in items:
            hay = f"{item.manufacturer} {item.model} {item.upc or ''} {item.caliber}"
            if q and not matches_query(hay, q):
                continue
            rows.append(
                MarketListing(
                    id=slug_id(self.name, item.id),
                    source=self.name.removeprefix("wholesale-"),
                    title=f"{item.manufacturer} {item.model}",
                    price=item.dealer_price,
                    price_type="wholesale",
                    condition="new" if item.in_stock else "used",
                    upc=item.upc or "",
                    scraped_at=now,
                )
            )
        return rows


def wholesale_adapters() -> list[WholesaleCsvAdapter]:
    return [WholesaleCsvAdapter(source) for source in list_inventory_sources()]
