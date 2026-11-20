/** All-in acquisition cost (the true cost basis). */

import type { DealInput } from "./types";

/**
 * allInCost = hammer × (1 + BP%) × (1 + purchaseCard%) + inboundShip
 * For a straight wholesaler buy, buyerPremiumPct = 0 and purchaseCardPct = 0.
 *
 * Does NOT round — callers round at output boundaries via round2().
 */
export function allInCost(
  input: Pick<
    DealInput,
    "targetAcquisitionCost" | "buyerPremiumPct" | "inboundShip" | "purchaseCardPct"
  >,
): number {
  const base = Math.max(0, input.targetAcquisitionCost);
  const premiumRate = Math.max(0, input.buyerPremiumPct) / 100;
  const cardRate = Math.max(0, input.purchaseCardPct ?? 0) / 100;
  const inbound = Math.max(0, input.inboundShip);
  return base * (1 + premiumRate) * (1 + cardRate) + inbound;
}
