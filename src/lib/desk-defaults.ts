/** Dealer defaults persisted in localStorage for Gun Value Desk. */

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";

export const DESK_DEFAULTS_KEY = "desk-dealer-defaults-v1";

export type DeskDealerDefaults = {
  targetProfit: string;
  salesTaxPct: string;
  outboundShip: string;
  listingUpgrades: string;
  buyerPremiumPct: string;
  buyerPaysOutboundShip: boolean;
  buyerPaysCardFee: boolean;
  sellChannel: "gunbroker" | "local";
};

export function defaultDealerDefaults(): DeskDealerDefaults {
  return {
    targetProfit: String(DEAL_DEFAULTS.targetProfit),
    salesTaxPct: String(DEAL_DEFAULTS.salesTaxPct),
    outboundShip: String(DEAL_DEFAULTS.outboundShip),
    listingUpgrades: String(DEAL_DEFAULTS.listingUpgrades),
    buyerPremiumPct: String(DEAL_DEFAULTS.buyerPremiumPct),
    buyerPaysOutboundShip: DEAL_DEFAULTS.buyerPaysOutboundShip,
    buyerPaysCardFee: DEAL_DEFAULTS.buyerPaysCardFee,
    sellChannel: "gunbroker",
  };
}

export function loadDealerDefaults(): DeskDealerDefaults {
  if (typeof window === "undefined") return defaultDealerDefaults();
  try {
    const raw = localStorage.getItem(DESK_DEFAULTS_KEY);
    if (!raw) return defaultDealerDefaults();
    const parsed = JSON.parse(raw) as Partial<DeskDealerDefaults>;
    return { ...defaultDealerDefaults(), ...parsed };
  } catch {
    return defaultDealerDefaults();
  }
}

export function saveDealerDefaults(next: DeskDealerDefaults): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DESK_DEFAULTS_KEY, JSON.stringify(next));
}
