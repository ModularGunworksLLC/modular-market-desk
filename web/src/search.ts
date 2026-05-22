import type { CatalogItem, CompItem, DataBundle, ResultRow } from "./types";

export interface SearchFilters {
  query: string;
  semiAutoOnly: boolean;
  inStockOnly: boolean;
  onSaleOnly: boolean;
  minMarginPct: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function marketPricesFor(catalogId: string, comps: CompItem[]): number[] {
  return comps
    .filter((c) => c.catalog_id === catalogId)
    .map((c) => c.completed_price ?? c.asking_price)
    .filter((p): p is number => typeof p === "number" && p > 0);
}

function matchesQuery(item: CatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.manufacturer,
    item.model,
    item.upc ?? "",
    item.caliber,
    item.category,
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

export function searchCatalog(
  bundle: DataBundle,
  filters: SearchFilters
): ResultRow[] {
  const rows: ResultRow[] = [];

  for (const item of bundle.catalog) {
    if (!matchesQuery(item, filters.query)) continue;
    if (filters.semiAutoOnly && item.action !== "semi-auto") continue;
    if (filters.inStockOnly && !item.in_stock) continue;
    if (filters.onSaleOnly && !item.on_sale) continue;

    const prices = marketPricesFor(item.id, bundle.comps);
    const market_median = median(prices);
    const spread = market_median - item.dealer_price;
    const margin_pct =
      item.dealer_price > 0 ? (spread / item.dealer_price) * 100 : 0;

    if (margin_pct < filters.minMarginPct) continue;

    rows.push({ item, market_median, spread, margin_pct });
  }

  return rows.sort((a, b) => b.margin_pct - a.margin_pct);
}
