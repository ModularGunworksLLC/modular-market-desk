from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class CatalogItem:
    id: str
    source: str
    manufacturer: str
    model: str
    category: str
    action: str
    caliber: str
    dealer_price: float
    in_stock: bool
    on_sale: bool
    scraped_at: str
    upc: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CompItem:
    id: str
    catalog_id: str
    source: str
    scraped_at: str
    asking_price: float | None = None
    completed_price: float | None = None
    url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DataBundle:
    catalog: list[CatalogItem] = field(default_factory=list)
    comps: list[CompItem] = field(default_factory=list)
    generated_at: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "catalog": [c.to_dict() for c in self.catalog],
            "comps": [c.to_dict() for c in self.comps],
        }
