/**
 * Max Bid - the highest HAMMER price that still clears the flat target profit floor.
 *
 *   maxAllIn = bestNet - targetProfit
 *   maxBid   = max( 0, (maxAllIn - inboundShip) / (1 + buyerPremiumPct/100) )
 */

import { round2 } from "./fees";

export function maxBid(params: {
  bestNet: number;
  targetProfit: number;
  inboundShip: number;
  buyerPremiumPct: number;
}): number {
  const { bestNet, targetProfit, inboundShip, buyerPremiumPct } = params;
  if (!Number.isFinite(bestNet) || bestNet <= 0) return 0;

  const maxAllIn = bestNet - targetProfit;
  if (maxAllIn <= 0) return 0;

  const premiumRate = Math.max(0, buyerPremiumPct) / 100;
  const hammer = (maxAllIn - Math.max(0, inboundShip)) / (1 + premiumRate);
  return round2(Math.max(0, hammer));
}
