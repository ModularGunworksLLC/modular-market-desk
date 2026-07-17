/**
 * Client-safe deal defaults — literal fallbacks only, no process.env.
 * Must stay in sync with the fallbacks in constants.ts `num(..., fallback)`.
 * Server code that needs env overrides must import DEAL_DEFAULTS from constants.ts.
 */

export type ClientDealDefaults = {
  targetProfit: number;
  minMarginPct: number;
  buyerPremiumPct: number;
  listingUpgrades: number;
  outboundShip: number;
  salesTaxPct: number;
  buyerPaysOutboundShip: boolean;
  buyerPaysCardFee: boolean;
};

export const CLIENT_DEAL_DEFAULTS: ClientDealDefaults = {
  targetProfit: 50,
  minMarginPct: 15,
  buyerPremiumPct: 18,
  listingUpgrades: 3,
  outboundShip: 30,
  salesTaxPct: 9,
  buyerPaysOutboundShip: true,
  buyerPaysCardFee: true,
};
