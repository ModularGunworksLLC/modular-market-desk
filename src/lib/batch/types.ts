/** Shared batch buy-sheet result shape (client + server). */

import type { WebPriceConfidence } from "@/lib/db/schema";
import type { AskSoldDivergence, WebEnrichPhase } from "@/lib/web-comps/types";

export interface BatchResultRow {
  rowNumber: number;
  lot: string;
  label: string;
  category: string;
  currentBid: number | null;
  /** Next legal hammer (listing required_bid or schedule). */
  nextBid: number | null;
  /** Dealer all-in at next bid: next × (1+BP%) + inbound. */
  allInAtNext: number | null;
  /** Dealer all-in at current bid (if everyone stops). */
  allInAtCurrent: number | null;
  buyerPremiumPct: number;
  /** @deprecated Prefer maxBidLocal / maxBidGb — kept for sort defaults. */
  sellChannel: "gunbroker" | "local";
  /** Max Bid floored to a legal increment step (best of the two exits). */
  walkAwayBid: number | null;
  /** Selected / best-exit verdict for legacy columns. */
  verdict: "GO" | "NO-GO" | null;
  verdictLocal: "GO" | "NO-GO" | null;
  verdictGb: "GO" | "NO-GO" | null;
  /** Best (higher) of the two exit max bids — used for headroom / sort. */
  maxBid: number | null;
  maxBidLocal: number | null;
  maxBidGb: number | null;
  /** Lower of best max bid and the new dealer floor — true walk-away ceiling. */
  walkAway: number | null;
  /** Profit at nextBid via Local. */
  netProfitLocal: number | null;
  /** Profit at nextBid via GunBroker. */
  netProfitGb: number | null;
  /** @deprecated alias of netProfitLocal for older UI — prefer dual fields. */
  netProfit: number | null;
  /** @deprecated alias of netProfitLocal */
  localProfit: number | null;
  soldCount: number;
  soldP25: number | null;
  soldMedian: number | null;
  /** Decision sold P25 (after Cooling cap if applied). */
  decisionP25: number | null;
  /**
   * Market median sold (OA) — context only; Max Bid uses Decision P25 after fees.
   */
  estimatedGrossResale: number | null;
  /** Where estimatedGrossResale came from. */
  grossResaleNote: string | null;
  askMedian: number | null;
  divergence: AskSoldDivergence | null;
  dealerFloor: number | null;
  bestDealer: string | null;
  /** Loud used-vs-new warning when all-in at next is at new money. */
  newDealerWarning: string | null;
  /** maxBid − nextBid (room after the raise you must make). */
  headroom: number | null;
  incrementSource: "listing" | "settings";
  matchNote: string;
  matchScore: number | null;
  /** Outdoor Analytics catalog hit used for sold/asking comps (when auto-matched). */
  oaCatalog: {
    manufacturer: string;
    model: string;
    caliber: string;
    condition: string;
    score: number;
  } | null;
  /** Web enrich lifecycle for this lot (queued / ready / OA / etc.). */
  webEnrich: {
    phase: WebEnrichPhase;
    canonicalKey: string | null;
    confidence: WebPriceConfidence | null;
    count: number;
    domainCount: number;
    median: number | null;
    agreement?: "agrees" | "web_higher" | "web_lower" | null;
    divergence?: AskSoldDivergence | null;
  } | null;
  /** Identity / OA↔web disparity warnings. */
  matchWarnings: string[];
  error: string | null;
}

export type BatchStreamEvent =
  | { type: "meta"; total: number; hasToken: boolean; incrementSourceHint?: string }
  | { type: "result"; completed: number; row: BatchResultRow }
  | { type: "done"; completed: number };
