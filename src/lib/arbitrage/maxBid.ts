/**
 * Max Bid - the highest HAMMER price that still clears both the target profit and the
 * minimum margin floor, working backward from market data.
 *
 *   maxAllIn = min( bestNet - targetProfit, bestNet / (1 + minMarginPct/100) )
 *   maxBid   = max( 0, (maxAllIn - inboundShip) / (1 + buyerPremiumPct/100) )
 */

import { round2 } from "./fees";

export function maxBid(params: {
  bestNet: number;
  targetProfit: number;
  minMarginPct: number;
  inboundShip: number;
  buyerPremiumPct: number;
}): number {
  const { bestNet, targetProfit, minMarginPct, inboundShip, buyerPremiumPct } = params;
  if (!Number.isFinite(bestNet) || bestNet <= 0) return 0;

  const byProfit = bestNet - targetProfit;
  const marginRate = Math.max(0, minMarginPct) / 100;
  const byMargin = bestNet / (1 + marginRate);
  const maxAllIn = Math.min(byProfit, byMargin);
  if (maxAllIn <= 0) return 0;

  const premiumRate = Math.max(0, buyerPremiumPct) / 100;
  const hammer = (maxAllIn - Math.max(0, inboundShip)) / (1 + premiumRate);
  return round2(Math.max(0, hammer));
}
