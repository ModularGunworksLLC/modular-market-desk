/** All-in acquisition cost (the true cost basis). */

import { round2 } from "./fees";
import type { DealInput } from "./types";

/**
 * allInCost = targetAcquisitionCost * (1 + buyerPremiumPct/100) + inboundShip
 * For a straight wholesaler buy, buyerPremiumPct = 0.
 */
export function allInCost(input: Pick<DealInput, "targetAcquisitionCost" | "buyerPremiumPct" | "inboundShip">): number {
  const base = Math.max(0, input.targetAcquisitionCost);
  const premiumRate = Math.max(0, input.buyerPremiumPct) / 100;
  const inbound = Math.max(0, input.inboundShip);
  return round2(base * (1 + premiumRate) + inbound);
}
