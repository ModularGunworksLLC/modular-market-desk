import { describe, expect, it } from "vitest";

import {
  effectiveHammerCeiling,
  hammerFromMaxAllIn,
  NEW_FLOOR_BUFFER,
  violatesNewFloor,
} from "./new-floor";

describe("new floor buffer", () => {
  it(`NO-GO when all-in within $${NEW_FLOOR_BUFFER} of new`, () => {
    expect(violatesNewFloor(325, 350)).toBe(true);
    expect(violatesNewFloor(324, 350)).toBe(false);
  });

  it("caps hammer below profit max when near new wholesale", () => {
    const profitMax = 400;
    const effective = effectiveHammerCeiling({
      profitMaxHammer: profitMax,
      dealerFloor: 350,
      inboundShip: 0,
      buyerPremiumPct: 0,
      applyNewFloor: true,
    });
    expect(effective).toBeLessThan(profitMax);
    expect(effective).toBe(325);
  });

  it("inverts max all-in to hammer with premium", () => {
    expect(hammerFromMaxAllIn(325, 25, 18)).toBeCloseTo(254.24, 1);
  });
});
