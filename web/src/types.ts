export type ContextMode = "auction_sniper" | "vendor_deal" | "margin_spotter";
export type PriceType = "sold" | "asking" | "estimate" | "wholesale";

export interface FirearmQuery {
  category: string;
  manufacturer: string;
  model: string;
  variant: string;
  caliber: string;
  condition: string;
  barrel_length: string;
  upc: string;
  mpn: string;
  exclude_tokens: string[];
}

export interface PriceStats {
  count: number;
  low: number;
  median: number;
  high: number;
  p25: number;
  p75: number;
  avg: number;
}

export interface MarketListing {
  id: string;
  source: string;
  title: string;
  price: number;
  price_type: PriceType;
  condition: string;
  date: string;
  url: string;
  upc: string;
  location: string;
  match_score: number;
  included_in_stats: boolean;
  scraped_at: string;
}

export interface ValuationInsights {
  context: ContextMode;
  headline: string;
  max_bid: number | null;
  promo_ok: boolean | null;
  margin_pct: number | null;
  margin_dollars: number | null;
  my_cost: number | null;
  lowest_wholesale: number | null;
  retail_street_low: number | null;
  sold_median_90d: number | null;
  assumptions: Record<string, unknown>;
}

export interface TrendPoint {
  month: string;
  avg_price: number;
  count: number;
}

export interface ValuationResult {
  query: FirearmQuery;
  context: ContextMode;
  canonical_key: string;
  generated_at: string;
  sold_stats: PriceStats;
  asking_stats: PriceStats;
  wholesale_stats: PriceStats;
  estimate_stats: PriceStats;
  listings: MarketListing[];
  insights: ValuationInsights;
  trends: TrendPoint[];
  source_status: Record<string, string>;
}

export interface ValuatePayload extends FirearmQuery {
  context: ContextMode;
  my_cost?: number | null;
  use_cache?: boolean;
  sample_only?: boolean;
}
