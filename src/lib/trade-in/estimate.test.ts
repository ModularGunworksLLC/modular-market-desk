import { describe, expect, it } from "vitest";

import { tradeInOfferFromMarketP25 } from "./estimate";

describe("tradeInOfferFromMarketP25", () => {
  it("shows min(Local, GB) max offer at $100 profit for P25 $482", () => {
    // Matches desk screenshot math with $100 profit instead of $50:
    // Local net $442.20 → max $342.20; GB net $446.72 → max $346.72 → customer $342.20
    const offer = tradeInOfferFromMarketP25({
      marketP25: 482,
      targetProfit: 100,
      minMarginPct: 0,
      salesTaxRate: 0.09,
      outboundShip: 30,
      listingUpgrades: 3,
      buyerPaysOutboundShip: true,
      buyerPaysCardFee: true,
    });

    expect(offer.localNet).toBe(442.2);
    expect(offer.gbNet).toBe(446.72);
    expect(offer.localMaxOffer).toBe(342.2);
    expect(offer.gbMaxOffer).toBe(346.72);
    expect(offer.customerOffer).toBe(342.2);
  });

  it("still picks Local when 15% margin binds less tightly than $100 profit", () => {
    const offer = tradeInOfferFromMarketP25({
      marketP25: 482,
      targetProfit: 100,
      minMarginPct: 15,
      salesTaxRate: 0.09,
      outboundShip: 30,
      listingUpgrades: 3,
      buyerPaysOutboundShip: true,
      buyerPaysCardFee: true,
    });
    // fromProfit 342.20 < fromMargin 384.52 → profit still binds
    expect(offer.customerOffer).toBe(342.2);
  });

  it("returns 0 when nets cannot clear the profit floor", () => {
    const offer = tradeInOfferFromMarketP25({
      marketP25: 50,
      targetProfit: 100,
      minMarginPct: 0,
      salesTaxRate: 0.09,
      outboundShip: 30,
      listingUpgrades: 3,
      buyerPaysOutboundShip: true,
      buyerPaysCardFee: true,
    });
    expect(offer.customerOffer).toBe(0);
  });
});
