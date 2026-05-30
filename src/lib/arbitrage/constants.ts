/**
 * Arbitrage math constants - THE CONTRACT.
 * These values are fixed fee schedules / tax rates. Do not change without an explicit instruction.
 */

// --- Tiered GunBroker Final Value Fee (firearms/ammo) ---
export const FVF_TIER1_RATE = 0.06; // 6% on the first $400
export const FVF_TIER1_CAP = 400; // tier-1 boundary in dollars
export const FVF_TIER2_RATE = 0.04; // 4% on the amount above $400
export const FVF_MAX_SALE = 15_000; // FVF only applies up to $15,000 of sale price

// --- Flat / rate fees for a GunBroker sale (Route A) ---
export const MASTER_FFL_FEE = 5.0; // flat $5 Master FFL transfer document fee
export const CARD_PROCESSING_RATE = 0.03; // 3% card processing on total charged to buyer
export const LISTING_UPGRADE_MIN = 0; // clamp floor
export const LISTING_UPGRADE_MAX = 5; // typical upgrades run $1-$5

// --- Local Alabama sale (Route B) ---
export const AL_SALES_TAX_RATE = 0.09; // 9% local AL sales tax, backed out of gross

/** Env-overridable deal defaults. Parsed once at import. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

export const DEAL_DEFAULTS = {
  targetProfit: num("DEAL_TARGET_PROFIT", 75),
  minMarginPct: num("DEAL_MIN_MARGIN_PCT", 15),
  buyerPremiumPct: num("DEAL_DEFAULT_BUYER_PREMIUM_PCT", 18),
  listingUpgrades: num("DEAL_DEFAULT_LISTING_UPGRADE", 3),
  outboundShip: num("DEAL_DEFAULT_OUTBOUND_SHIP", 30),
} as const;
