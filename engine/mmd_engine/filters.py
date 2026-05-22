from dataclasses import dataclass

from mmd_engine.models import CatalogItem, CompItem, DataBundle


@dataclass
class SearchFilters:
    query: str = ""
    semi_auto_only: bool = False
    in_stock_only: bool = False
    on_sale_only: bool = False
    min_margin_pct: float = 0.0


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    mid = len(sorted_vals) // 2
    if len(sorted_vals) % 2 == 0:
        return (sorted_vals[mid - 1] + sorted_vals[mid]) / 2
    return sorted_vals[mid]


def market_prices_for(catalog_id: str, comps: list[CompItem]) -> list[float]:
    prices: list[float] = []
    for comp in comps:
        if comp.catalog_id != catalog_id:
            continue
        price = comp.completed_price or comp.asking_price
        if price and price > 0:
            prices.append(price)
    return prices


def apply_filters(bundle: DataBundle, filters: SearchFilters) -> DataBundle:
    catalog: list[CatalogItem] = []
    kept_ids: set[str] = set()

    for item in bundle.catalog:
        hay = f"{item.manufacturer} {item.model} {item.upc or ''} {item.caliber}"
        if not _matches_tokens(hay, filters.query):
            continue
        if filters.semi_auto_only and item.action != "semi-auto":
            continue
        if filters.in_stock_only and not item.in_stock:
            continue
        if filters.on_sale_only and not item.on_sale:
            continue

        prices = market_prices_for(item.id, bundle.comps)
        market_median = median(prices)
        spread = market_median - item.dealer_price
        margin_pct = (spread / item.dealer_price * 100) if item.dealer_price > 0 else 0.0
        if margin_pct < filters.min_margin_pct:
            continue

        catalog.append(item)
        kept_ids.add(item.id)

    comps = [c for c in bundle.comps if c.catalog_id in kept_ids]
    return DataBundle(catalog=catalog, comps=comps, generated_at=bundle.generated_at)


def _matches_tokens(haystack: str, query: str) -> bool:
    q = query.strip().lower()
    if not q:
        return True
    h = haystack.lower()
    return all(token in h for token in q.split())
