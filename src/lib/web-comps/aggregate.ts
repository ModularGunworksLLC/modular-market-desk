import { summarize } from "@/lib/arbitrage/stats";
import type { PriceStats } from "@/lib/arbitrage/types";
import { filterOutlierPrices } from "@/lib/comp-filter";
import type { WebPriceConfidence, WebPriceStat } from "@/lib/db/schema";

import type { WebIdentity } from "./types";

const FRESH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SPREAD_MAX = 1.6; // p75/p25

export function webCanonicalKey(id: WebIdentity): string {
  const upc = (id.upc ?? "").replace(/\D/g, "");
  if (upc.length >= 8) return `upc:${upc}`;
  return [
    id.category ?? "",
    id.manufacturer,
    id.model,
    id.caliber ?? "",
    id.variant ?? "",
  ]
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function buildSearchQuery(id: WebIdentity): string {
  const parts = [id.manufacturer, id.model, id.variant, id.caliber, id.upc]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  parts.push("price");
  return parts.join(" ");
}

export function scoreWebConfidence(params: {
  domainCount: number;
  p25: number;
  p75: number;
  newestObservedAt: Date | null;
}): WebPriceConfidence {
  const fresh =
    params.newestObservedAt != null &&
    Date.now() - params.newestObservedAt.getTime() <= FRESH_MS;
  const spreadOk =
    params.p25 > 0 && params.p75 > 0 ? params.p75 / params.p25 <= SPREAD_MAX : false;

  if (params.domainCount >= 3 && fresh && spreadOk) return "high";
  if (params.domainCount >= 2 && fresh) return "medium";
  return "low";
}

export function aggregatePrices(prices: number[]): {
  count: number;
  low: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  high: number | null;
  filtered: number[];
} {
  const { filtered } = filterOutlierPrices(prices);
  const stats = summarize(filtered);
  if (stats.count === 0) {
    return { count: 0, low: null, p25: null, median: null, p75: null, high: null, filtered: [] };
  }
  return {
    count: stats.count,
    low: stats.low,
    p25: stats.p25,
    median: stats.median,
    p75: stats.p75,
    high: stats.high,
    filtered,
  };
}

/** Compare OA median to web median for advisory badges. */
export function compareOaToWeb(
  oaMedian: number | null | undefined,
  webMedian: number | null | undefined,
  bandPct = 15,
): "agrees" | "web_higher" | "web_lower" | null {
  if (oaMedian == null || webMedian == null || oaMedian <= 0 || webMedian <= 0) return null;
  const lo = oaMedian * (1 - bandPct / 100);
  const hi = oaMedian * (1 + bandPct / 100);
  if (webMedian >= lo && webMedian <= hi) return "agrees";
  return webMedian > oaMedian ? "web_higher" : "web_lower";
}

/** Ask-vs-sold sanity: Cooling when street asks sit well under sold FMV. */
export type AskSoldDivergence = "cooling" | "ok" | "asks_rich" | "thin";

export function assessAskSoldDivergence(params: {
  soldAnchor: number | null | undefined;
  askMedian: number | null | undefined;
  askCount: number;
  /** Asks below this fraction of sold → cooling (default 0.85). */
  coolRatio?: number;
  /** Asks above this multiple of sold → asks_rich (default 1.15). */
  richRatio?: number;
  minAskCount?: number;
}): AskSoldDivergence {
  const minN = params.minAskCount ?? 3;
  const cool = params.coolRatio ?? 0.85;
  const rich = params.richRatio ?? 1.15;
  const sold = params.soldAnchor;
  const ask = params.askMedian;
  if (
    sold == null ||
    ask == null ||
    sold <= 0 ||
    ask <= 0 ||
    params.askCount < minN
  ) {
    return "thin";
  }
  if (ask < sold * cool) return "cooling";
  if (ask > sold * rich) return "asks_rich";
  return "ok";
}

/**
 * When Cooling, cap sold decision percentiles so Max Bid cannot ignore street asks.
 * Does not invent a blended FMV — only lowers the sold anchor toward ask median.
 */
export function applyCoolingCapToSold(
  sold: PriceStats,
  askMedian: number,
): PriceStats {
  if (askMedian <= 0 || sold.count <= 0) return sold;
  const cap = askMedian;
  return {
    ...sold,
    p25: Math.min(sold.p25, cap),
    median: Math.min(sold.median, cap),
    p75: Math.min(sold.p75, cap),
    high: Math.min(sold.high, Math.max(cap, sold.p75)),
    avg: Math.min(sold.avg, cap),
  };
}

/** Turn a high-conf web_price_stats row into PriceStats for evaluateDeal. */
export function priceStatsFromWebRow(row: WebPriceStat): PriceStats | null {
  if (row.count < 3 || row.p25 == null || row.median == null || row.p75 == null) return null;
  return {
    count: row.count,
    low: row.low ?? row.p25,
    p25: row.p25,
    median: row.median,
    p75: row.p75,
    high: row.high ?? row.p75,
    avg: row.median,
  };
}
