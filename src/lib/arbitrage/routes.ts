/**
 * The two exit routes. Each works BACKWARD from a gross sell price `G` to net proceeds.
 * Pure functions; rounding applied to the returned breakdown fields only.
 */

import {
  AL_SALES_TAX_RATE,
  LISTING_UPGRADE_MAX,
  LISTING_UPGRADE_MIN,
  MASTER_FFL_FEE,
} from "./constants";
import { cardProcessingFee, finalValueFee, round2 } from "./fees";
import type { RouteBreakdown } from "./types";

function clampUpgrades(listingUpgrades: number): number {
  if (!Number.isFinite(listingUpgrades)) return LISTING_UPGRADE_MIN;
  return Math.min(LISTING_UPGRADE_MAX, Math.max(LISTING_UPGRADE_MIN, listingUpgrades));
}

/**
 * Route A - Sell on GunBroker (shipped, online).
 *   net = G - FVF(G) - $5 master FFL - outboundShip - 3%(G + outboundShip) - listingUpgrades
 */
export function routeGunBroker(params: {
  sellPrice: number;
  outboundShip: number;
  listingUpgrades: number;
}): RouteBreakdown {
  const sell = Math.max(0, params.sellPrice);
  const outbound = Math.max(0, params.outboundShip);
  const upgrades = clampUpgrades(params.listingUpgrades);

  const fvf = finalValueFee(sell);
  const card = cardProcessingFee(sell, outbound);
  const net = sell - fvf - MASTER_FFL_FEE - outbound - card - upgrades;

  return {
    route: "gunbroker",
    sellPrice: round2(sell),
    finalValueFee: round2(fvf),
    masterFflFee: round2(MASTER_FFL_FEE),
    outboundShip: round2(outbound),
    cardFee: round2(card),
    listingUpgrades: round2(upgrades),
    taxAbsorbed: 0,
    net: round2(net),
  };
}

/**
 * Route B - Local Alabama sale (forum / pickup).
 * Shipping = 0, platform fees = 0. The local price is tax-inclusive, so we back out the
 * 9% AL sales tax that must be remitted from the proceeds:
 *   sellerGross = G / (1 + 0.09);  taxAbsorbed = G - sellerGross;  net = sellerGross
 */
export function routeLocalAlabama(params: { sellPrice: number }): RouteBreakdown {
  const sell = Math.max(0, params.sellPrice);
  const sellerGross = sell / (1 + AL_SALES_TAX_RATE);
  const taxAbsorbed = sell - sellerGross;

  return {
    route: "local_al",
    sellPrice: round2(sell),
    finalValueFee: 0,
    masterFflFee: 0,
    outboundShip: 0,
    cardFee: 0,
    listingUpgrades: 0,
    taxAbsorbed: round2(taxAbsorbed),
    net: round2(sellerGross),
  };
}
