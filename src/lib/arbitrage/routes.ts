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
 *   net = G - FVF(G) - $5 master FFL - listingUpgrades
 *        - (outboundShip unless buyerPaysOutboundShip)
 *        - (3%(G+ship) unless buyerPaysCardFee)
 */
export function routeGunBroker(params: {
  sellPrice: number;
  outboundShip: number;
  listingUpgrades: number;
  buyerPaysOutboundShip?: boolean;
  buyerPaysCardFee?: boolean;
}): RouteBreakdown {
  const sell = Math.max(0, params.sellPrice);
  const outbound = Math.max(0, params.outboundShip);
  const upgrades = clampUpgrades(params.listingUpgrades);
  const buyerPaysShip = params.buyerPaysOutboundShip !== false;
  const buyerPaysCard = params.buyerPaysCardFee !== false;

  const fvf = finalValueFee(sell);
  const card = cardProcessingFee(sell, outbound);
  const shipLeak = buyerPaysShip ? 0 : outbound;
  const cardLeak = buyerPaysCard ? 0 : card;
  const net = sell - fvf - MASTER_FFL_FEE - shipLeak - cardLeak - upgrades;

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
 * Route B - Local sale (forum / pickup).
 * Shipping = 0, platform fees = 0. The local price is tax-inclusive, so we back out
 * sales tax remitted from proceeds:
 *   sellerGross = G / (1 + rate);  taxAbsorbed = G - sellerGross;  net = sellerGross
 * Default rate is AL 9% when omitted.
 */
export function routeLocalAlabama(params: {
  sellPrice: number;
  /** Fraction, e.g. 0.09. Defaults to AL_SALES_TAX_RATE. */
  salesTaxRate?: number;
}): RouteBreakdown {
  const sell = Math.max(0, params.sellPrice);
  const rate =
    params.salesTaxRate != null && Number.isFinite(params.salesTaxRate) && params.salesTaxRate >= 0
      ? params.salesTaxRate
      : AL_SALES_TAX_RATE;
  const sellerGross = sell / (1 + rate);
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
