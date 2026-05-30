import { describe, expect, it } from "vitest";

import { allInCost } from "./acquisition";
import { finalValueFee, round2 } from "./fees";
import { maxBid } from "./maxBid";
import { routeGunBroker, routeLocalAlabama } from "./routes";
import { summarize } from "./stats";
import { evaluateDeal } from "./evaluate";
import type { DealInput } from "./types";

describe("finalValueFee (tiered)", () => {
  it("charges 6% under $400", () => {
    expect(round2(finalValueFee(400))).toBe(24); // 0.06 * 400
  });
  it("charges 6% on first $400 + 4% above", () => {
    // $1000 -> 24 + 0.04*600 = 24 + 24 = 48
    expect(round2(finalValueFee(1000))).toBe(48);
  });
  it("caps the basis at $15,000", () => {
    const at15k = 0.06 * 400 + 0.04 * (15000 - 400);
    expect(round2(finalValueFee(20000))).toBe(round2(at15k));
  });
});

describe("routeLocalAlabama backs out 9% AL tax (user's worked example)", () => {
  it("$399 local -> seller nets $366.06, absorbs $32.94 tax", () => {
    const b = routeLocalAlabama({ sellPrice: 399 });
    expect(b.net).toBe(366.06);
    expect(b.taxAbsorbed).toBe(32.94);
    expect(b.finalValueFee).toBe(0);
    expect(b.outboundShip).toBe(0);
  });
});

describe("routeGunBroker deducts every leak", () => {
  it("nets correctly at $1000 with $30 outbound and $3 upgrades", () => {
    const b = routeGunBroker({ sellPrice: 1000, outboundShip: 30, listingUpgrades: 3 });
    // fvf 48, ffl 5, outbound 30, card 0.03*(1000+30)=30.9, upgrades 3
    // net = 1000 - 48 - 5 - 30 - 30.9 - 3 = 883.1
    expect(b.finalValueFee).toBe(48);
    expect(b.cardFee).toBe(30.9);
    expect(b.net).toBe(883.1);
  });
});

describe("allInCost applies buyer premium then inbound", () => {
  it("$500 hammer + 18% premium + $25 inbound = $615", () => {
    expect(allInCost({ targetAcquisitionCost: 500, buyerPremiumPct: 18, inboundShip: 25 })).toBe(615);
  });
});

describe("maxBid inverts the net to a hammer ceiling", () => {
  it("returns 0 when net cannot clear the target", () => {
    expect(maxBid({ bestNet: 50, targetProfit: 75, minMarginPct: 15, inboundShip: 0, buyerPremiumPct: 0 })).toBe(0);
  });
  it("solves backward through premium + inbound", () => {
    // bestNet 800, target 75 -> byProfit 725; minMargin 15% -> byMargin 800/1.15=695.65
    // maxAllIn = 695.65 ; hammer = (695.65 - 25)/1.18 = 568.35
    const mb = maxBid({ bestNet: 800, targetProfit: 75, minMarginPct: 15, inboundShip: 25, buyerPremiumPct: 18 });
    expect(mb).toBeCloseTo(568.35, 1);
  });
});

describe("evaluateDeal end-to-end", () => {
  const input: DealInput = {
    targetAcquisitionCost: 400,
    inboundShip: 25,
    buyerPremiumPct: 0,
    outboundShip: 30,
    listingUpgrades: 3,
    targetProfit: 75,
    minMarginPct: 15,
  };
  const sold = summarize([700, 750, 800, 820, 850, 900]);

  it("produces a verdict, a best route, and a max bid", () => {
    const r = evaluateDeal(input, sold);
    expect(r.allInCost).toBe(425);
    expect(["GO", "NO-GO"]).toContain(r.verdict);
    expect(["gunbroker", "local_al"]).toContain(r.bestRoute);
    expect(r.scenarios).toHaveLength(3);
    expect(r.maxBid).toBeGreaterThan(0);
    // The engine always picks the higher-netting route as bestNet/bestRoute.
    const expectedBest = Math.max(r.chosen.routeA.net, r.chosen.routeB.net);
    expect(r.chosen.bestNet).toBe(expectedBest);
    expect(r.chosen.bestRoute).toBe(
      r.chosen.routeA.net >= r.chosen.routeB.net ? "gunbroker" : "local_al",
    );
    // At a ~$810 median, AL local (810/1.09 = 743.12) out-nets GunBroker after fees/shipping.
    expect(r.chosen.routeB.net).toBeGreaterThan(r.chosen.routeA.net);
    expect(r.bestRoute).toBe("local_al");
  });
});
