import { describe, expect, it } from "vitest";

import { allInCost } from "./acquisition";
import { finalValueFee, round2 } from "./fees";
import { maxBid } from "./maxBid";
import { routeGunBroker, routeLocalAlabama } from "./routes";
import { summarize } from "./stats";
import { evaluateDeal } from "./evaluate";
import { decideVerdict } from "./verdict";
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

describe("routeGunBroker", () => {
  it("deducts ship and card when seller pays", () => {
    const b = routeGunBroker({
      sellPrice: 1000,
      outboundShip: 30,
      listingUpgrades: 3,
      buyerPaysOutboundShip: false,
      buyerPaysCardFee: false,
    });
    // fvf 48, ffl 5, outbound 30, card 0.03*(1000+30)=30.9, upgrades 3
    // net = 1000 - 48 - 5 - 30 - 30.9 - 3 = 883.1
    expect(b.finalValueFee).toBe(48);
    expect(b.cardFee).toBe(30.9);
    expect(b.net).toBe(883.1);
  });

  it("skips ship and card when buyer pays (default)", () => {
    const b = routeGunBroker({ sellPrice: 1000, outboundShip: 30, listingUpgrades: 3 });
    expect(b.cardFee).toBe(30.9);
    expect(b.net).toBe(944);
  });
});

describe("allInCost applies buyer premium then inbound", () => {
  it("$500 hammer + 18% premium + $25 inbound = $615", () => {
    expect(allInCost({ targetAcquisitionCost: 500, buyerPremiumPct: 18, inboundShip: 25 })).toBe(615);
  });
});

describe("maxBid inverts the net to a hammer ceiling", () => {
  it("returns 0 when net cannot clear the target", () => {
    expect(maxBid({ bestNet: 50, targetProfit: 75, inboundShip: 0, buyerPremiumPct: 0 })).toBe(0);
  });
  it("solves backward through premium + inbound", () => {
    // bestNet 800, target 75 -> maxAllIn 725 ; hammer = (725 - 25)/1.18 = 593.22
    const mb = maxBid({ bestNet: 800, targetProfit: 75, inboundShip: 25, buyerPremiumPct: 18 });
    expect(mb).toBeCloseTo(593.22, 1);
  });
  it("applies min margin floor when tighter than profit target", () => {
    // bestNet 800, targetProfit 50 -> fromProfit 750
    // minMargin 15% -> fromMargin 800/1.15 ≈ 695.65 → binds
    const mb = maxBid({
      bestNet: 800,
      targetProfit: 50,
      minMarginPct: 15,
      inboundShip: 0,
      buyerPremiumPct: 0,
    });
    expect(mb).toBeCloseTo(800 / 1.15, 2);
  });
  it("ignores margin floor when minMarginPct is 0", () => {
    const mb = maxBid({
      bestNet: 800,
      targetProfit: 75,
      minMarginPct: 0,
      inboundShip: 0,
      buyerPremiumPct: 0,
    });
    expect(mb).toBe(725);
  });
});

describe("decideVerdict requires profit and margin floors", () => {
  it("NO-GO when margin below floor even if profit clears", () => {
    expect(
      decideVerdict({ netProfit: 100, targetProfit: 50, marginPct: 10, minMarginPct: 15 }),
    ).toBe("NO-GO");
  });
  it("GO when both floors clear", () => {
    expect(
      decideVerdict({ netProfit: 100, targetProfit: 50, marginPct: 20, minMarginPct: 15 }),
    ).toBe("GO");
  });
});

describe("evaluateDeal end-to-end", () => {
  const input: DealInput = {
    targetAcquisitionCost: 400,
    inboundShip: 25,
    buyerPremiumPct: 0,
    outboundShip: 30,
    buyerPaysOutboundShip: true,
    buyerPaysCardFee: true,
    listingUpgrades: 3,
    targetProfit: 50,
    minMarginPct: 0,
    salesTaxRate: 0.09,
    sellChannel: "gunbroker",
  };
  const sold = summarize([700, 750, 800, 820, 850, 900]);

  it("uses P25 + sellChannel for decision metrics", () => {
    const r = evaluateDeal(input, sold);
    expect(r.allInCost).toBe(425);
    expect(r.chosen.label).toBe("P25");
    expect(r.decisionRoute).toBe("gunbroker");
    expect(["GO", "NO-GO"]).toContain(r.verdict);
    expect(r.scenarios).toHaveLength(3);
    expect(r.maxBid).toBeGreaterThan(0);
    expect(r.profitMaxHammer).toBe(
      maxBid({
        bestNet: r.chosen.routeA.net,
        targetProfit: input.targetProfit,
        minMarginPct: input.minMarginPct,
        inboundShip: input.inboundShip,
        buyerPremiumPct: input.buyerPremiumPct,
      }),
    );
    expect(r.effectiveMaxHammer).toBe(r.profitMaxHammer);
    expect(r.localNetProfit).toBe(round2(r.chosen.routeB.net - r.allInCost));
    // With buyer-paid ship/card, GunBroker net can beat local at the same sell price.
    expect(r.upsideRoute).toBe(r.chosen.bestRoute);
  });

  it("NO-GO when minMarginPct is not cleared", () => {
    const tight: DealInput = { ...input, minMarginPct: 90, targetProfit: 1 };
    const r = evaluateDeal(tight, sold);
    expect(r.verdict).toBe("NO-GO");
    expect(r.verdictReasons.some((x) => /margin/i.test(x))).toBe(true);
  });
});
