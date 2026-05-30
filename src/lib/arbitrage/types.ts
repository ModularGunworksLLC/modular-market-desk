/** Shared types for the arbitrage math engine. Pure data - no I/O. */

export type SellRoute = "gunbroker" | "local_al";
export type Verdict = "GO" | "NO-GO";
export type ScenarioLabel = "P25" | "Median" | "P75";

export interface PriceStats {
  count: number;
  low: number;
  p25: number;
  median: number;
  p75: number;
  high: number;
  avg: number;
}

export interface DealInput {
  /** Hammer / auction price OR wholesaler price being considered. */
  targetAcquisitionCost: number;
  /** Shipping to acquire the item. */
  inboundShip: number;
  /** Auction buyer's premium percent (0 for a straight wholesaler buy). */
  buyerPremiumPct: number;
  /** Outbound shipping when reselling on GunBroker (Route A). */
  outboundShip: number;
  /** Optional GunBroker listing upgrades, clamped to [0, 5]. */
  listingUpgrades: number;
  /** Profit floor in dollars for a GO verdict. */
  targetProfit: number;
  /** Minimum margin percent for a GO verdict. */
  minMarginPct: number;
}

export interface RouteBreakdown {
  route: SellRoute;
  sellPrice: number; // gross sell price G (a SOLD percentile)
  finalValueFee: number;
  masterFflFee: number;
  outboundShip: number;
  cardFee: number;
  listingUpgrades: number;
  taxAbsorbed: number; // > 0 only for local_al
  net: number; // net proceeds to the seller
}

export interface ScenarioResult {
  label: ScenarioLabel;
  sellPrice: number;
  routeA: RouteBreakdown;
  routeB: RouteBreakdown;
  bestRoute: SellRoute;
  bestNet: number;
  netProfit: number;
  marginPct: number;
  maxBid: number;
}

export interface EvaluationResult {
  input: DealInput;
  allInCost: number;
  sold: PriceStats;
  scenarios: ScenarioResult[];
  /** The decision scenario (Median by default). */
  chosen: ScenarioResult;
  verdict: Verdict;
  bestRoute: SellRoute;
  maxBid: number;
  netProfit: number;
  marginPct: number;
}
