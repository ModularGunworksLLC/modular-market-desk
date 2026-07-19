/** Shared types for the arbitrage math engine. Pure data - no I/O. */

export type SellRoute = "gunbroker" | "local_al";
/** User-selected exit channel for headline max bid / verdict. */
export type SellChannel = "gunbroker" | "local";
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
  /** Minimum margin on all-in (%). GO requires marginPct >= this; also caps max bid. */
  minMarginPct: number;
  /**
   * Local sales-tax rate as a fraction (e.g. 0.09 for 9%).
   * Only affects local_al net / local max bid.
   */
  salesTaxRate: number;
  /** Which exit channel drives verdict + headline max bid. Default gunbroker. */
  sellChannel: SellChannel;
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

/** Per-exit walk-away + GO/NO-GO at the decision sell anchor. */
export interface ExitDecision {
  maxBid: number;
  /** Profit-only max hammer before new-floor clamp. */
  profitMaxBid: number;
  netProfit: number;
  marginPct: number;
  verdict: Verdict;
  verdictReasons: string[];
}

export interface EvaluationResult {
  input: DealInput;
  allInCost: number;
  sold: PriceStats;
  scenarios: ScenarioResult[];
  /** Decision scenario — P25 sold (used) or lowest ask (vendor). */
  chosen: ScenarioResult;
  /**
   * Both exits always computed (same P25/ask anchor, same all-in).
   * Prefer this over the selected-channel headline fields for dual UI.
   */
  exits: {
    gunbroker: ExitDecision;
    local: ExitDecision;
  };
  /** Selected-channel verdict (input.sellChannel). */
  verdict: Verdict;
  /** Human-readable NO-GO triggers for the selected channel. */
  verdictReasons: string[];
  decisionAnchor: DecisionAnchor;
  /** Market anchor used for chosen scenario sell price. */
  decisionSellPrice: number;
  /** Which exit channel drives selected-channel verdict + maxBid. */
  decisionRoute: SellRoute;
  /** Higher-netting route at decision anchor (informational upside). */
  upsideRoute: SellRoute;
  /** Selected-channel max hammer from profit math only (before new-floor). */
  profitMaxHammer: number;
  /** Selected-channel walk-away after new-floor (alias of exits[channel].maxBid). */
  effectiveMaxHammer: number;
  /** @deprecated alias — use effectiveMaxHammer / exits */
  maxBid: number;
  /** Selected-channel net profit at current all-in. */
  netProfit: number;
  marginPct: number;
  localNetProfit: number;
  /** Local exit walk-away after new-floor (same as exits.local.maxBid). */
  localMaxBid: number;
  profitUpside: number;
}
