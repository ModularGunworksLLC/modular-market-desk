"""Load dealer catalog rows from imported CSV inventory files."""

from __future__ import annotations

import logging

from mmd_engine.adapters.base import DealerAdapter
from mmd_engine.csv.store import list_inventory_sources, load_inventory
from mmd_engine.models import CatalogItem
from mmd_engine.util import matches_query

logger = logging.getLogger(__name__)


class CsvInventoryAdapter(DealerAdapter):
    def __init__(self, source: str) -> None:
        self.name = source

    def search(self, query: str) -> list[CatalogItem]:
        items = load_inventory(self.name)
        if not items:
            logger.debug("No CSV inventory for %s", self.name)
            return []
        if not query.strip():
            return items
        return [
            item
            for item in items
            if matches_query(
                f"{item.manufacturer} {item.model} {item.upc or ''} {item.caliber}",
                query,
            )
        ]


def csv_inventory_adapters() -> list[CsvInventoryAdapter]:
    return [CsvInventoryAdapter(source) for source in list_inventory_sources()]
