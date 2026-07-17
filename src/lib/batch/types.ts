/** Shared batch buy-sheet result shape (client + server). */

export interface BatchResultRow {
  rowNumber: number;
  lot: string;
  label: string;
  category: string;
  currentBid: number | null;
  /** Next legal hammer (listing required_bid or schedule). */
  nextBid: number | null;
  /** Max Bid floored to a legal increment step. */
  walkAwayBid: number | null;
  verdict: "GO" | "NO-GO" | null;
  maxBid: number | null;
  /** Lower of profit-based max bid and the new dealer floor — the true walk-away ceiling. */
  walkAway: number | null;
  /** Profit at nextBid (actionable), not current bid. */
  netProfit: number | null;
  localProfit: number | null;
  soldCount: number;
  soldP25: number | null;
  soldMedian: number | null;
  dealerFloor: number | null;
  bestDealer: string | null;
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
  error: string | null;
}

export type BatchStreamEvent =
  | { type: "meta"; total: number; hasToken: boolean; incrementSourceHint?: string }
  | { type: "result"; completed: number; row: BatchResultRow }
  | { type: "done"; completed: number };
