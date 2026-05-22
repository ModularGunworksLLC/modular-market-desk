from abc import ABC, abstractmethod

from mmd_engine.models import CatalogItem, CompItem


class MarketAdapter(ABC):
    """Public market data source (GunBroker, Gun.deals, etc.)."""

    name: str

    @abstractmethod
    def search(self, query: str) -> tuple[list[CatalogItem], list[CompItem]]:
        """Return catalog rows and comps for a search query."""


class DealerAdapter(ABC):
    """Distributor portal — Phase 2."""

    name: str

    @abstractmethod
    def search(self, query: str) -> list[CatalogItem]:
        """Return dealer-priced catalog rows for a query."""
