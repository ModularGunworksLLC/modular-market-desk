/** Dealer defaults persisted in localStorage for Gun Value Desk. */

import { CLIENT_DEAL_DEFAULTS } from "@/lib/arbitrage/client-defaults";
import {
  DEFAULT_BID_INCREMENTS,
  normalizeBidIncrements,
  type BidIncrementBand,
} from "@/lib/auctions/bid-increments";

export const DESK_DEFAULTS_KEY = "desk-dealer-defaults-v1";

export type DeskDealerDefaults = {
  targetProfit: string;
  minMarginPct: string;
  salesTaxPct: string;
  outboundShip: string;
  listingUpgrades: string;
  buyerPremiumPct: string;
  buyerPaysOutboundShip: boolean;
  buyerPaysCardFee: boolean;
  sellChannel: "gunbroker" | "local";
  /** Fallback auction increment schedule when listing does not supply next bid. */
  bidIncrements: BidIncrementBand[];
};

export function defaultDealerDefaults(): DeskDealerDefaults {
  return {
    targetProfit: String(CLIENT_DEAL_DEFAULTS.targetProfit),
    minMarginPct: String(CLIENT_DEAL_DEFAULTS.minMarginPct),
    salesTaxPct: String(CLIENT_DEAL_DEFAULTS.salesTaxPct),
    outboundShip: String(CLIENT_DEAL_DEFAULTS.outboundShip),
    listingUpgrades: String(CLIENT_DEAL_DEFAULTS.listingUpgrades),
    buyerPremiumPct: String(CLIENT_DEAL_DEFAULTS.buyerPremiumPct),
    buyerPaysOutboundShip: CLIENT_DEAL_DEFAULTS.buyerPaysOutboundShip,
    buyerPaysCardFee: CLIENT_DEAL_DEFAULTS.buyerPaysCardFee,
    sellChannel: "gunbroker",
    bidIncrements: DEFAULT_BID_INCREMENTS.map((b) => ({ ...b })),
  };
}

export function loadDealerDefaults(): DeskDealerDefaults {
  if (typeof window === "undefined") return defaultDealerDefaults();
  try {
    const raw = localStorage.getItem(DESK_DEFAULTS_KEY);
    if (!raw) return defaultDealerDefaults();
    const parsed = JSON.parse(raw) as Partial<DeskDealerDefaults>;
    return {
      ...defaultDealerDefaults(),
      ...parsed,
      minMarginPct:
        parsed.minMarginPct != null && String(parsed.minMarginPct).trim() !== ""
          ? String(parsed.minMarginPct)
          : defaultDealerDefaults().minMarginPct,
      bidIncrements: normalizeBidIncrements(parsed.bidIncrements),
    };
  } catch {
    return defaultDealerDefaults();
  }
}

export function saveDealerDefaults(next: DeskDealerDefaults): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    DESK_DEFAULTS_KEY,
    JSON.stringify({
      ...next,
      bidIncrements: normalizeBidIncrements(next.bidIncrements),
    }),
  );
}
