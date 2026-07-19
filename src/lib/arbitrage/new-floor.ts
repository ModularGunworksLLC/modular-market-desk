/**
 * New wholesale floor — used buys must stay more than $25 below cheapest in-stock new.
 */

import { round2 } from "./fees";

/** Dollars below new dealer price before a used buy is treated as "new money". */
export const NEW_FLOOR_BUFFER = 25;

/** All-in must stay strictly below dealerFloor − buffer. */
export function newFloorAllInCeiling(dealerFloor: number | null | undefined): number | null {
  if (dealerFloor == null || !Number.isFinite(dealerFloor) || dealerFloor <= NEW_FLOOR_BUFFER) {
    return null;
  }
  return round2(dealerFloor - NEW_FLOOR_BUFFER);
}

export function violatesNewFloor(allInCost: number, dealerFloor: number | null | undefined): boolean {
  const ceiling = newFloorAllInCeiling(dealerFloor);
  if (ceiling == null) return false;
  return allInCost >= ceiling;
}

/** Loud used-vs-new callout when all-in is within the new-floor buffer. */
export function formatNewDealerWarning(params: {
  allInCost: number;
  dealerFloor: number | null | undefined;
  vendorLabel?: string | null;
  /** e.g. "at next" for batch sheets */
  allInContext?: string;
}): string | null {
  if (!violatesNewFloor(params.allInCost, params.dealerFloor)) return null;
  const floor = params.dealerFloor!;
  const vendor = (params.vendorLabel ?? "").trim() || "distributor";
  const ctx = params.allInContext ? ` ${params.allInContext}` : "";
  return `NEW @ ${vendor} $${floor.toFixed(2)} — all-in${ctx} is within $${NEW_FLOOR_BUFFER} of new wholesale; skip used.`;
}

/** Invert all-in ceiling to a hammer / cash offer (before premium). */
export function hammerFromMaxAllIn(
  maxAllIn: number,
  inboundShip: number,
  buyerPremiumPct: number,
): number {
  if (!Number.isFinite(maxAllIn) || maxAllIn <= 0) return 0;
  const premiumRate = Math.max(0, buyerPremiumPct) / 100;
  const hammer = (maxAllIn - Math.max(0, inboundShip)) / (1 + premiumRate);
  return round2(Math.max(0, hammer));
}

/** Walk-away hammer: lower of profit max and new-floor cap. */
export function effectiveHammerCeiling(params: {
  profitMaxHammer: number;
  dealerFloor: number | null | undefined;
  inboundShip: number;
  buyerPremiumPct: number;
  applyNewFloor: boolean;
}): number {
  let cap = Math.max(0, params.profitMaxHammer);
  if (!params.applyNewFloor) return round2(cap);

  const maxAllIn = newFloorAllInCeiling(params.dealerFloor);
  if (maxAllIn != null && maxAllIn > 0) {
    const floorHammer = hammerFromMaxAllIn(maxAllIn, params.inboundShip, params.buyerPremiumPct);
    cap = Math.min(cap, floorHammer);
  }
  return round2(Math.max(0, cap));
}
