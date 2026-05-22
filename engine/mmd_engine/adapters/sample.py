"""Sample adapter for development until real market sources are wired."""

from mmd_engine.adapters.base import MarketAdapter
from mmd_engine.models import CatalogItem, CompItem, utc_now_iso

_SAMPLE_ROWS: list[dict] = [
    {
        "id": "sample-g19",
        "manufacturer": "Glock",
        "model": "G19 Gen5",
        "upc": "764503001317",
        "caliber": "9mm",
        "dealer_price": 449.0,
        "in_stock": True,
        "on_sale": False,
        "market_prices": [549.0, 579.0],
        "completed": [525.0, 540.0],
    },
    {
        "id": "sample-shield",
        "manufacturer": "Smith & Wesson",
        "model": "M&P Shield Plus",
        "caliber": "9mm",
        "dealer_price": 379.0,
        "in_stock": True,
        "on_sale": True,
        "market_prices": [449.0],
        "completed": [420.0],
    },
    {
        "id": "sample-p365",
        "manufacturer": "Sig Sauer",
        "model": "P365",
        "caliber": "9mm",
        "dealer_price": 499.0,
        "in_stock": True,
        "on_sale": False,
        "market_prices": [599.0, 579.0],
        "completed": [565.0, 550.0],
    },
    {
        "id": "sample-57",
        "manufacturer": "FN",
        "model": "Five-seveN",
        "caliber": "5.7x28",
        "dealer_price": 1099.0,
        "in_stock": True,
        "on_sale": False,
        "market_prices": [1299.0],
        "completed": [1195.0],
    },
    {
        "id": "sample-ar15",
        "manufacturer": "Smith & Wesson",
        "model": "M&P15 Sport II",
        "caliber": "5.56",
        "category": "rifle",
        "dealer_price": 629.0,
        "in_stock": False,
        "on_sale": False,
        "market_prices": [749.0],
        "completed": [699.0],
    },
]


class SampleMarketAdapter(MarketAdapter):
    name = "sample"

    def search(self, query: str) -> tuple[list[CatalogItem], list[CompItem]]:
        q = query.strip().lower()
        now = utc_now_iso()
        catalog: list[CatalogItem] = []
        comps: list[CompItem] = []

        for row in _SAMPLE_ROWS:
            hay = f"{row['manufacturer']} {row['model']} {row.get('upc', '')} {row['caliber']}".lower()
            if q and not all(token in hay for token in q.split()):
                continue

            catalog.append(
                CatalogItem(
                    id=row["id"],
                    source=self.name,
                    manufacturer=row["manufacturer"],
                    model=row["model"],
                    upc=row.get("upc"),
                    category=row.get("category", "handgun"),
                    action="semi-auto" if row.get("category", "handgun") == "handgun" else "semi-auto",
                    caliber=row["caliber"],
                    dealer_price=row["dealer_price"],
                    in_stock=row["in_stock"],
                    on_sale=row["on_sale"],
                    scraped_at=now,
                )
            )

            for i, asking in enumerate(row["market_prices"]):
                completed = row["completed"][i] if i < len(row["completed"]) else None
                comps.append(
                    CompItem(
                        id=f"{row['id']}-comp-{i}",
                        catalog_id=row["id"],
                        source=f"{self.name}-market",
                        asking_price=asking,
                        completed_price=completed,
                        scraped_at=now,
                    )
                )

        return catalog, comps
