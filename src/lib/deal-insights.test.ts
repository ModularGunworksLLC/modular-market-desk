import { describe, expect, it } from "vitest";

import { buildDealInsights } from "./deal-insights";
import type { EvaluationResult, PriceStats } from "./arbitrage/types";
import type { WholesaleGrid } from "./wholesale";

const emptyStats: PriceStats = {
  count: 0,
  low: 0,
  p25: 0,
  median: 0,
  p75: 0,
  high: 0,
  avg: 0,
};

function minimalResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    input: {
      targetAcquisitionCost: 260,
      inboundShip: 0,
      buyerPremiumPct: 0,
      outboundShip: 30,
      buyerPaysOutboundShip: true,
      buyerPaysCardFee: true,
      listingUpgrades: 3,
      targetProfit: 50,
      minMarginPct: 0,
      salesTaxRate: 0.09,
      sellChannel: "gunbroker",
    },
    allInCost: 260,
    sold: { ...emptyStats, count: 10, median: 280, p25: 200, p75: 320 },
    scenarios: [],
    chosen: {
      label: "P25",
      sellPrice: 280,
      routeA: { route: "gunbroker", sellPrice: 280, finalValueFee: 0, masterFflFee: 5, outboundShip: 30, cardFee: 0, listingUpgrades: 3, taxAbsorbed: 0, net: 200 },
      routeB: { route: "local_al", sellPrice: 280, finalValueFee: 0, masterFflFee: 0, outboundShip: 0, cardFee: 0, listingUpgrades: 0, taxAbsorbed: 0, net: 210 },
      bestRoute: "local_al",
      bestNet: 210,
      netProfit: -50,
      marginPct: -19,
      maxBid: 100,
      localProfit: -40,
      localMarginPct: -15,
      localMaxBid: 120,
      profitUpside: 10,
    },
    verdict: "NO-GO",
    verdictReasons: [],
    decisionAnchor: "p25-sold",
    decisionSellPrice: 200,
    decisionRoute: "gunbroker",
    upsideRoute: "local_al",
    profitMaxHammer: 100,
    effectiveMaxHammer: 100,
    maxBid: 100,
    netProfit: -50,
    marginPct: -19,
    localNetProfit: -40,
    localMaxBid: 120,
    profitUpside: 10,
    ...overrides,
  };
}

const wholesale: WholesaleGrid = {
  firearmMatches: [],
  matches: [
    {
      vendorName: "chattanooga",
      sku: "x",
      upc: null,
      manufacturer: "Ruger",
      model: "10/22",
      productLabel: "10/22 Carbine",
      dealerPrice: 199,
      inStock: true,
      cheaperThanTarget: true,
    },
  ],
  cheapestInStockFirearm: 199,
  suggestedHammerCeiling: 199,
  cheaperThanTarget: true,
  matchMode: "text",
  warning: null,
};

describe("buildDealInsights", () => {
  it("vendor mode surfaces savings headline", () => {
    const insights = buildDealInsights({
      modeId: "vendor",
      result: minimalResult({ allInCost: 260, netProfit: 20, marginPct: 7.7 }),
      sold: { ...emptyStats, count: 100, median: 280 },
      asking: { ...emptyStats, count: 10, median: 215, low: 210 },
      wholesale,
    });
    expect(insights.bestAlternate?.savings).toBe(61);
    expect(insights.headlines.some((h) => h.includes("Save"))).toBe(true);
    expect(insights.marketTooSoft).toBe(true);
  });
});
