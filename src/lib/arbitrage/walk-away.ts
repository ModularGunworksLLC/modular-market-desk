/**
 * Walk-away hammer for an auction lot.
 *
 * Dealer floor is a distributor price, not a paddle price. Convert it first:
 *   dealerHammer = (dealerFloor - $25 buffer - inboundShip) / (1 + BP + card)
 * where BP and card are percents (15 and 3 → 0.15 and 0.03).
 * Walk-away is min(maxHammer, dealerHammer). No walk-away without sold comps
 * (maxHammer null), even when a dealer floor exists.
 */

import { round2 } from "./fees";

export const DEALER_FLOOR_BUFFER = 25;

export function dealerFloorToHammer(params: {
  dealerFloor: number | null | undefined;
  inboundShip: number;
  buyerPremiumPct: number;
  purchaseCardPct: number;
  buffer?: number;
}): number | null {
  const floor = params.dealerFloor;
  if (floor == null || !Number.isFinite(floor)) return null;
  const buffer = params.buffer ?? DEALER_FLOOR_BUFFER;
  const inbound = Math.max(0, params.inboundShip);
  const denom =
    1 + Math.max(0, params.buyerPremiumPct) / 100 + Math.max(0, params.purchaseCardPct) / 100;
  if (!(denom > 0)) return null;
  const hammer = (floor - buffer - inbound) / denom;
  if (!Number.isFinite(hammer) || hammer <= 0) return null;
  return round2(hammer);
}

export function walkAwayHammer(params: {
  maxHammer: number | null | undefined;
  dealerHammer: number | null | undefined;
}): number | null {
  const max = params.maxHammer;
  if (max == null || !Number.isFinite(max) || max <= 0) return null;
  const dealer = params.dealerHammer;
  if (dealer == null || !Number.isFinite(dealer) || dealer <= 0) return round2(max);
  return round2(Math.min(max, dealer));
}
