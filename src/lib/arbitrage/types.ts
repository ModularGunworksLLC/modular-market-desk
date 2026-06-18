/** Shared types for the arbitrage math engine. Pure data - no I/O. */

export type SellRoute = "gunbroker" | "local_al";
export type Verdict = "GO" | "NO-GO";
export type ScenarioLabel = "P25" | "Median" | "P75";
export type DecisionAnchor = "p25-sold" | "low-asking";

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
  /** Typical outbound ship on the listing (for display); may be paid by buyer. */
  outboundShip: number;
  /** When true, outbound ship is not deducted from GunBroker net (buyer pays). */
  buyerPaysOutboundShip: boolean;
  /** When true, card processing is not deducted from GunBroker net (buyer pays). */
  buyerPaysCardFee: boolean;
  /** Optional GunBroker listing upgrades, clamped to [0, 5]. */
  listingUpgrades: number;
  /** Profit floor in dollars for a GO verdict (flat rule). */
  targetProfit: number;
  /** Legacy field — not used for verdict or max bid (kept for API compat). */
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
  /** Higher-netting route at this sell price (comparison only). */
  bestRoute: SellRoute;
  bestNet: number;
  /** Conservative decision: GunBroker net − all-in. */
  netProfit: number;
  marginPct: number;
  /** Conservative max hammer from GunBroker net. */
  maxBid: number;
  /** Local AL net − all-in (upside if you sell face-to-face). */
  localProfit: number;
  localMarginPct: number;
  localMaxBid: number;
  /** localProfit − netProfit (≥ 0 when local wins on profit). */
  profitUpside: number;
}

export interface EvaluationResult {
  input: DealInput;
  allInCost: number;
  sold: PriceStats;
  scenarios: ScenarioResult[];
  /** Decision scenario — P25 sold (used) or lowest ask (vendor). */
  chosen: ScenarioResult;
  verdict: Verdict;
  /** Human-readable NO-GO triggers (profit, new floor, wholesale). */
  verdictReasons: string[];
  decisionAnchor: DecisionAnchor;
  /** Market anchor used for chosen scenario sell price. */
  decisionSellPrice: number;
  /** Always gunbroker — official verdict/max bid use GB fees. */
  decisionRoute: SellRoute;
  /** Route with higher net at decision anchor (informational). */
  upsideRoute: SellRoute;
  /** Max hammer from profit math only (before new-floor cap). */
  profitMaxHammer: number;
  /** Walk-away hammer after new-floor cap (used modes). Same as profitMaxHammer when no cap. */
  effectiveMaxHammer: number;
  /** @deprecated alias — use effectiveMaxHammer */
  maxBid: number;
  netProfit: number;
  marginPct: number;
  localNetProfit: number;
  localMaxBid: number;
  profitUpside: number;
}
