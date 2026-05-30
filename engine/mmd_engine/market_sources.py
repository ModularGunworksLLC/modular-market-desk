"""Live market sources used for vendor-deal / margin valuation."""

from __future__ import annotations

from dataclasses import dataclass

from mmd_engine.adapters.outdoor_analytics import OutdoorAnalyticsAdapter
from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.adapters.wholesale_csv import wholesale_adapters
from mmd_engine.config import legacy_market_scrapers_enabled
from mmd_engine.oa_session import load_bearer_token

def _legacy_adapters() -> list[ValuationAdapter]:
    if not legacy_market_scrapers_enabled():
        return []
    from mmd_engine.adapters.gunbroker import GunBrokerAdapter
    from mmd_engine.adapters.gundeals_valuation import GunDealsValuationAdapter
    from mmd_engine.adapters.truegunvalue import TrueGunValueAdapter

    return [
        TrueGunValueAdapter(),
        GunBrokerAdapter(),
        GunDealsValuationAdapter(),
    ]


@dataclass(frozen=True)
class MarketSourceMeta:
    id: str
    label: str
    description: str
    session_site: str | None = None


MARKET_SOURCES: tuple[MarketSourceMeta, ...] = (
    MarketSourceMeta(
        id="outdoor_analytics",
        label="Outdoor Analytics",
        description="GunBroker Analytics — sold comps and active listings (GB Analytics hub API)",
        session_site="outdoor_analytics",
    ),
)


def live_market_adapters() -> list[ValuationAdapter]:
    """Live pricing for /api/valuate — Outdoor Analytics only by default."""
    from mmd_engine.config import skip_market_sources

    skip = skip_market_sources()
    adapters: list[ValuationAdapter] = []

    oa_skipped = "outdoor_analytics" in skip or "outdoor-analytics" in skip
    if load_bearer_token() and not oa_skipped:
        adapters.append(OutdoorAnalyticsAdapter())

    for legacy in _legacy_adapters():
        if legacy.name not in skip:
            adapters.append(legacy)

    return adapters


def all_valuation_adapters(*, sample_only: bool) -> list[ValuationAdapter]:
    from mmd_engine.adapters.sample_valuation import SampleValuationAdapter

    if sample_only:
        return [SampleValuationAdapter()]
    adapters: list[ValuationAdapter] = list(live_market_adapters())
    adapters.extend(wholesale_adapters())
    return adapters


def source_catalog_text() -> str:
    lines = [f"{m.label}: {m.description}" for m in MARKET_SOURCES]
    if legacy_market_scrapers_enabled():
        lines.append("Legacy scrapers enabled (TGV / GunBroker / Gun.deals)")
    lines.append("Wholesale CSV: imported distributor catalogs (dealer cost only)")
    return " · ".join(lines)
