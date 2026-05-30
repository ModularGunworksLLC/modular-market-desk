export type ContextMode = "auction_sniper" | "vendor_deal" | "margin_spotter";
export type PriceType = "sold" | "asking" | "estimate" | "wholesale";
export type SellScenario = "p25" | "median" | "p75";
export type Confidence = "high" | "medium" | "low";
export type Verdict = "GO" | "MARGINAL" | "NO-GO";

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

export interface GbNetRow {
  scenario: string;
  sell_gross: number;
  final_value_fee: number;
  master_ffl_fee: number;
  listing_addons: number;
  net_proceeds: number;
}

export interface ProfitRow {
  scenario: string;
  sell_gross: number;
  gb_net: number;
  profit: number;
  margin_pct: number;
}

export interface DealerBrief {
  confidence: Confidence;
  verdict: Verdict;
  verdict_reason: string;
  red_flags: string[];
  market: {
    sold_label: string;
    sold_count: number;
    sold_count_all: number;
    sold_low: number;
    sold_p25: number;
    sold_median: number;
    sold_p75: number;
    sold_high: number;
    asking_count: number;
    asking_low: number;
    asking_median: number;
    ask_vs_sold_gap: number | null;
    ask_vs_sold_label: string;
    trend: string;
    monthly_volume_90d: number;
  };
  gb_net_table: GbNetRow[];
  profit_at_cost: ProfitRow[];
  all_in: {
    mode: string;
    buyer_premium_pct: number;
    transfer_fee: number;
    inbound_ship: number;
    fixed_fees: number;
    invoice_or_hammer?: number;
    buyer_premium_amt?: number;
    all_in_total?: number;
  };
  ceilings: {
    sell_assumption: SellScenario;
    sell_price: number;
    sell_assumption_label: string;
    break_even_all_in: number;
    max_pay_all_in: number;
    max_hammer: number | null;
    conservative_max_pay_all_in: number;
    aggressive_max_pay_all_in: number;
    target_profit: number;
    min_margin_pct: number;
  };
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
  dealer_brief: DealerBrief;
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
  sold_stats_sku: PriceStats;
  sold_stats_all: PriceStats;
  asking_stats: PriceStats;
  wholesale_stats: PriceStats;
  estimate_stats: PriceStats;
  listings: MarketListing[];
  insights: ValuationInsights;
  trends: TrendPoint[];
  source_status: Record<string, string>;
}

export interface DealAssumptions {
  context: ContextMode;
  my_cost?: number | null;
  street_retail?: number | null;
  reference_msrp?: number | null;
  buyer_premium_pct?: number | null;
  listing_addons?: number | null;
  target_profit?: number | null;
  min_margin_pct?: number | null;
  transfer_fee?: number | null;
  inbound_ship?: number | null;
  sell_assumption?: SellScenario | null;
}

export interface ValuatePayload extends FirearmQuery, DealAssumptions {
  use_cache?: boolean;
  force_refresh?: boolean;
  sample_only?: boolean;
}

export interface RecomputePayload extends FirearmQuery, DealAssumptions {}
