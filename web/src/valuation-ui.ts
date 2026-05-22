import type { MarketListing, PriceStats, PriceType, ValuationResult } from "./types";

export function formatMoney(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatStats(stats: PriceStats): string {
  if (!stats.count) return "No data";
  return `${formatMoney(stats.median)} median · ${stats.count} comps · ${formatMoney(stats.low)}–${formatMoney(stats.high)}`;
}

export function listingsByType(
  result: ValuationResult,
  priceType: PriceType,
  statsOnly = true
): MarketListing[] {
  return result.listings
    .filter((l) => l.price_type === priceType)
    .filter((l) => (statsOnly ? l.included_in_stats : true))
    .sort((a, b) => b.match_score - a.match_score || b.price - a.price);
}

export function searchPreview(query: ValuationResult["query"]): string {
  const parts = [
    query.category,
    query.manufacturer,
    query.model,
    query.variant,
    query.caliber,
    query.condition !== "any" ? `(${query.condition})` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

export function renderTrendBars(trends: ValuationResult["trends"]): string {
  if (!trends.length) {
    return '<p class="muted">Trend data appears after sold listings with dates are collected.</p>';
  }
  const max = Math.max(...trends.map((t) => t.avg_price), 1);
  return trends
    .map((t) => {
      const pct = Math.round((t.avg_price / max) * 100);
      return `
        <div class="trend-row">
          <span class="trend-label">${t.month}</span>
          <div class="trend-bar-wrap"><div class="trend-bar" style="width:${pct}%"></div></div>
          <span class="trend-val">${formatMoney(t.avg_price)} (${t.count})</span>
        </div>`;
    })
    .join("");
}
