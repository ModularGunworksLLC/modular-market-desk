"""Live market sources used for vendor-deal / margin valuation."""

from __future__ import annotations

from dataclasses import dataclass

from mmd_engine.adapters.gunbroker import GunBrokerAdapter
from mmd_engine.adapters.gundeals_valuation import GunDealsValuationAdapter
from mmd_engine.adapters.truegunvalue import TrueGunValueAdapter
from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.adapters.wholesale_csv import wholesale_adapters


@dataclass(frozen=True)
class MarketSourceMeta:
    id: str
    label: str
    description: str
    session_site: str | None = None  # playwright storage_state name under data/sessions/


MARKET_SOURCES: tuple[MarketSourceMeta, ...] = (
    MarketSourceMeta(
        id="truegunvalue",
        label="TrueGunValue",
        description="Sold history and estimates (GunBroker-derived comps)",
    ),
    MarketSourceMeta(
        id="gunbroker",
        label="GunBroker",
        description="Completed auctions and current listings",
        session_site="gunbroker",
    ),
    MarketSourceMeta(
        id="gundeals",
        label="Gun.deals",
        description="Retail promos across many online gun stores",
        session_site="gundeals",
    ),
)


def live_market_adapters() -> list[ValuationAdapter]:
    """All public internet price sources for /api/valuate (run in parallel)."""
    return [
        TrueGunValueAdapter(),
        GunBrokerAdapter(),
        GunDealsValuationAdapter(),
    ]


def all_valuation_adapters(*, sample_only: bool) -> list[ValuationAdapter]:
    from mmd_engine.adapters.sample_valuation import SampleValuationAdapter

    if sample_only:
        return [SampleValuationAdapter()]
    adapters: list[ValuationAdapter] = list(live_market_adapters())
    adapters.extend(wholesale_adapters())
    return adapters


def source_catalog_text() -> str:
    lines = [f"{m.label}: {m.description}" for m in MARKET_SOURCES]
    lines.append("Wholesale CSV: your imported distributor catalogs (dealer cost)")
    return " · ".join(lines)
