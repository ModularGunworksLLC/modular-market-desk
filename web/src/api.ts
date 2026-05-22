import type { DataBundle } from "./types";
import type { SearchFilters } from "./search";

export async function liveSearch(
  apiUrl: string,
  apiKey: string,
  filters: SearchFilters
): Promise<DataBundle> {
  const base = apiUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const res = await fetch(`${base}/api/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      q: filters.query,
      semi_auto_only: filters.semiAutoOnly,
      in_stock_only: filters.inStockOnly,
      on_sale_only: filters.onSaleOnly,
      min_margin_pct: filters.minMarginPct,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }

  return (await res.json()) as DataBundle;
}
