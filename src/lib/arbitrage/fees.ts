/** GunBroker fee primitives. Pure functions - no rounding of intermediates. */

import {
  CARD_PROCESSING_RATE,
  FVF_MAX_SALE,
  FVF_TIER1_CAP,
  FVF_TIER1_RATE,
  FVF_TIER2_RATE,
} from "./constants";

/** Round to cents only at output boundaries. */
export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Tiered GunBroker Final Value Fee:
 *   6% on the first $400, 4% on the amount from $400 up to $15,000.
 * Sale price is capped at $15,000 for the fee calc.
 */
export function finalValueFee(salePrice: number): number {
  const capped = Math.max(0, Math.min(salePrice, FVF_MAX_SALE));
  const tier1 = Math.min(capped, FVF_TIER1_CAP) * FVF_TIER1_RATE;
  const tier2 = Math.max(0, capped - FVF_TIER1_CAP) * FVF_TIER2_RATE;
  return tier1 + tier2;
}

/** 3% card processing on the TOTAL charged to the buyer (item + outbound shipping). */
export function cardProcessingFee(salePrice: number, outboundShip: number): number {
  return CARD_PROCESSING_RATE * (Math.max(0, salePrice) + Math.max(0, outboundShip));
}
