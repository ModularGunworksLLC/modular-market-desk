"""Single-item valuation desk data models."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from mmd_engine.models import utc_now_iso

ContextMode = Literal["auction_sniper", "vendor_deal", "margin_spotter"]
PriceType = Literal["sold", "asking", "estimate", "wholesale"]
Condition = Literal["new", "used", "lnib", "any"]


@dataclass
class FirearmQuery:
    category: str = "handgun"
    manufacturer: str = ""
    model: str = ""
    variant: str = ""
    caliber: str = ""
    condition: Condition = "any"
    barrel_length: str = ""
    upc: str = ""
    mpn: str = ""
    exclude_tokens: list[str] = field(default_factory=list)

    def search_text(self) -> str:
        parts = [
            self.manufacturer,
            self.model,
            self.variant,
            self.caliber,
            self.mpn,
            self.upc,
        ]
        return " ".join(p for p in parts if p).strip()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MarketListing:
    id: str
    source: str
    title: str
    price: float
    price_type: PriceType
    scraped_at: str
    condition: str = ""
    date: str = ""
    url: str = ""
    upc: str = ""
    location: str = ""
    match_score: float = 0.0
    included_in_stats: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PriceStats:
    count: int = 0
    low: float = 0.0
    median: float = 0.0
    high: float = 0.0
    p25: float = 0.0
    p75: float = 0.0
    avg: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ValuationInsights:
    context: ContextMode = "auction_sniper"
    headline: str = ""
    max_bid: float | None = None
    promo_ok: bool | None = None
    margin_pct: float | None = None
    margin_dollars: float | None = None
    my_cost: float | None = None
    lowest_wholesale: float | None = None
    retail_street_low: float | None = None
    sold_median_90d: float | None = None
    assumptions: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TrendPoint:
    month: str
    avg_price: float
    count: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ValuationResult:
    query: FirearmQuery
    context: ContextMode
    canonical_key: str = ""
    generated_at: str = field(default_factory=utc_now_iso)
    sold_stats: PriceStats = field(default_factory=PriceStats)
    sold_stats_sku: PriceStats = field(default_factory=PriceStats)
    sold_stats_all: PriceStats = field(default_factory=PriceStats)
    asking_stats: PriceStats = field(default_factory=PriceStats)
    wholesale_stats: PriceStats = field(default_factory=PriceStats)
    estimate_stats: PriceStats = field(default_factory=PriceStats)
    listings: list[MarketListing] = field(default_factory=list)
    insights: ValuationInsights = field(default_factory=ValuationInsights)
    trends: list[TrendPoint] = field(default_factory=list)
    source_status: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query.to_dict(),
            "context": self.context,
            "canonical_key": self.canonical_key,
            "generated_at": self.generated_at,
            "sold_stats": self.sold_stats.to_dict(),
            "sold_stats_sku": self.sold_stats_sku.to_dict(),
            "sold_stats_all": self.sold_stats_all.to_dict(),
            "asking_stats": self.asking_stats.to_dict(),
            "wholesale_stats": self.wholesale_stats.to_dict(),
            "estimate_stats": self.estimate_stats.to_dict(),
            "listings": [listing.to_dict() for listing in self.listings],
            "insights": self.insights.to_dict(),
            "trends": [t.to_dict() for t in self.trends],
            "source_status": self.source_status,
        }
