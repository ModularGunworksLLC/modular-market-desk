/**
 * Max Bid - the highest HAMMER price that still clears BOTH the target profit
 * and the minimum margin floor.
 *
 *   maxAllIn = min( bestNet - targetProfit, bestNet / (1 + minMarginPct/100) )
 *   maxBid   = max( 0, (maxAllIn - inboundShip) / ((1 + BP%) × (1 + purchaseCard%)) )
 *
 * When minMarginPct is 0, the margin term is bestNet itself, so maxAllIn
 * collapses to bestNet - targetProfit (legacy flat-profit-only behavior).
 */

import { round2 } from "./fees";

export function maxBid(params: {
  bestNet: number;
  targetProfit: number;
  minMarginPct?: number;
  inboundShip: number;
  buyerPremiumPct: number;
  /** Card on purchase invoice (hammer+premium). Default 0. */
  purchaseCardPct?: number;
}): number {
  const { bestNet, targetProfit, inboundShip, buyerPremiumPct } = params;
  const minMarginPct = Math.max(0, params.minMarginPct ?? 0);
  const purchaseCardPct = Math.max(0, params.purchaseCardPct ?? 0);
  if (!Number.isFinite(bestNet) || bestNet <= 0) return 0;

  const fromProfit = bestNet - targetProfit;
  const fromMargin = bestNet / (1 + minMarginPct / 100);
  const maxAllIn = Math.min(fromProfit, fromMargin);
  if (maxAllIn <= 0) return 0;

  const premiumRate = Math.max(0, buyerPremiumPct) / 100;
  const cardRate = purchaseCardPct / 100;
  const hammer = (maxAllIn - Math.max(0, inboundShip)) / ((1 + premiumRate) * (1 + cardRate));
  return round2(Math.max(0, hammer));
}
