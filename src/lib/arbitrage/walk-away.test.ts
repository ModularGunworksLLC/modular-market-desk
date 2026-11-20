import { describe, expect, it } from "vitest";

import { dealerFloorToHammer, walkAwayHammer } from "./walk-away";

describe("walk-away hammer", () => {
  it("converts a dealer floor to a hammer with BP and card added, then takes the min", () => {
    // (400 - 25 - 0) / (1 + 0.15 + 0.03) = 375 / 1.18
    const dealerHammer = dealerFloorToHammer({
      dealerFloor: 400,
      inboundShip: 0,
      buyerPremiumPct: 15,
      purchaseCardPct: 3,
    });
    expect(dealerHammer).toBe(317.8);
    expect(walkAwayHammer({ maxHammer: 350, dealerHammer })).toBe(317.8);
    expect(walkAwayHammer({ maxHammer: 280, dealerHammer })).toBe(280);
  });

  it("subtracts inbound shipping before dividing", () => {
    const hammer = dealerFloorToHammer({
      dealerFloor: 400,
      inboundShip: 20,
      buyerPremiumPct: 0,
      purchaseCardPct: 0,
    });
    expect(hammer).toBe(355);
  });

  it("does not produce a walk-away when there are no comps", () => {
    const dealerHammer = dealerFloorToHammer({
      dealerFloor: 400,
      inboundShip: 0,
      buyerPremiumPct: 15,
      purchaseCardPct: 3,
    });
    expect(walkAwayHammer({ maxHammer: null, dealerHammer })).toBeNull();
    expect(walkAwayHammer({ maxHammer: 0, dealerHammer })).toBeNull();
  });

  it("keeps the comp max hammer when wholesale did not match", () => {
    expect(walkAwayHammer({ maxHammer: 210, dealerHammer: null })).toBe(210);
  });
});
