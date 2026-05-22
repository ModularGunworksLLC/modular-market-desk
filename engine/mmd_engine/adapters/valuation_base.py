from abc import ABC, abstractmethod

from mmd_engine.valuation_models import FirearmQuery, MarketListing


class ValuationAdapter(ABC):
    name: str

    @abstractmethod
    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        """Return raw listings from this source."""
