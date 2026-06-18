/** Shared batch buy-sheet result shape (client + server). */

export interface BatchResultRow {
  rowNumber: number;
  lot: string;
  label: string;
  category: string;
  currentBid: number | null;
  verdict: "GO" | "NO-GO" | null;
  maxBid: number | null;
  /** Lower of profit-based max bid and the new dealer floor — the true walk-away. */
  walkAway: number | null;
  netProfit: number | null;
  localProfit: number | null;
  soldCount: number;
  soldP25: number | null;
  soldMedian: number | null;
  dealerFloor: number | null;
  bestDealer: string | null;
  headroom: number | null;
  matchNote: string;
  matchScore: number | null;
  error: string | null;
}

export type BatchStreamEvent =
  | { type: "meta"; total: number; hasToken: boolean }
  | { type: "result"; completed: number; row: BatchResultRow }
  | { type: "done"; completed: number };
