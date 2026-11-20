import { describe, expect, it } from "vitest";

import { batchExportFilename, batchResultsToCsv } from "./csv";
import type { BatchResultRow } from "./types";

function stub(over: Partial<BatchResultRow>): BatchResultRow {
  return {
    rowNumber: 1,
    lot: "101",
    label: "Glock 19 Gen5 9mm",
    category: "handgun",
    currentBid: 420,
    nextBid: 430,
    inboundShip: 0,
    allInAtNext: 507.4,
    allInAtCurrent: 495.6,
    allInAtMaxGb: 365.8,
    allInAtMaxLocal: 424.8,
    buyerPremiumPct: 18,
    purchaseCardPct: 3,
    sellChannel: "local",
    walkAwayBid: 350,
    verdict: "GO",
    verdictLocal: "GO",
    verdictGb: "NO-GO",
    maxBid: 360,
    maxBidLocal: 360,
    maxBidGb: 310,
    walkAway: 350,
    netProfitLocal: 80,
    netProfitGb: 20,
    netProfit: 80,
    localProfit: 80,
    soldCount: 42,
    soldP25: 399,
    soldMedian: 450,
    decisionP25: 399,
    estimatedGrossResale: 450,
    grossResaleNote: "OA sold median · n=42",
    askMedian: 440,
    divergence: "ok",
    dealerFloor: 389,
    bestDealer: "lipseys",
    newDealerWarning: null,
    headroom: -70,
    incrementSource: "listing",
    matchNote: "local cache",
    matchScore: 91,
    oaCatalog: {
      manufacturer: "Glock",
      model: "19",
      caliber: "9mm",
      condition: "Used",
      score: 91,
    },
    webEnrich: null,
    matchWarnings: [],
    error: null,
    ...over,
  } as BatchResultRow;
}

describe("batchResultsToCsv", () => {
  it("writes a header and one data row with money as raw numbers", () => {
    const csv = batchResultsToCsv([stub({})]);
    const lines = csv.trimEnd().split(/\r\n/);
    expect(lines[0]).toContain("Lot,Item,Category,Local,GB");
    expect(lines[0]).toContain("Max hammer Local,You pay @ max Local,Max hammer GB,You pay @ max GB,Walk-away hammer");
    expect(lines[1]).toContain("101,Glock 19 Gen5 9mm,handgun,GO,NO-GO,OK,450,399,420,430");
    expect(lines[1]).toContain("360,424.8,310,365.8,350,-70,80,20,389,lipseys,42");
  });

  it("quotes commas and quotes in item titles", () => {
    const csv = batchResultsToCsv([
      stub({ label: 'Smith & Wesson M&P, "Shield" 9mm', matchNote: "a, b" }),
    ]);
    expect(csv).toContain('"Smith & Wesson M&P, ""Shield"" 9mm"');
    expect(csv).toContain('"a, b"');
  });

  it("leaves null money fields empty", () => {
    const csv = batchResultsToCsv([
      stub({
        maxBidLocal: null,
        maxBidGb: null,
        verdictLocal: null,
        verdictGb: null,
        soldMedian: null,
        estimatedGrossResale: null,
        decisionP25: null,
      }),
    ]);
    const data = csv.trimEnd().split(/\r\n/)[1]!;
    expect(data.startsWith("101,Glock 19 Gen5 9mm,handgun,,,OK,,,420,430")).toBe(true);
  });
});

describe("batchExportFilename", () => {
  it("stamps the date and GO-only flag", () => {
    const at = new Date("2026-08-28T12:00:00.000Z");
    expect(batchExportFilename({ at })).toBe("desk-batch-2026-08-28.csv");
    expect(batchExportFilename({ at, goOnly: true })).toBe("desk-batch-go-2026-08-28.csv");
  });
});
