import { describe, expect, it } from "vitest";

import { lotsToBatchCsv } from "@/lib/auctions/csv";
import { extractLotBidMetaFromHtml } from "@/lib/auctions/hibid";
import { bidWranglerLotPrice } from "@/lib/auctions/bidwrangler";
import { parseBatchSheet, parseTitleBlob } from "@/lib/batch/parse";

describe("quote-aware batch CSV", () => {
  it("keeps a newline inside a quoted title on the same lot", () => {
    const csv = 'Lot,Title,Current Bid\n20,"Rock River LAR-15\n5.56 rifle",350\n21,Glock 19,400\n';
    const parsed = parseBatchSheet(csv);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.lot).toBe("20");
    expect(parsed.rows[0]?.rawTitle).toContain("LAR-15");
    expect(parsed.rows[0]?.rawTitle).toContain("5.56");
    expect(parsed.rows[0]?.currentBid).toBe(350);
    expect(parsed.rows[0]?.category).toBe("rifle");
    expect(parsed.rows[1]?.manufacturer).toBe("Glock");
    expect(parsed.rows[1]?.currentBid).toBe(400);
  });

  it("round-trips a multiline title from lotsToBatchCsv", () => {
    const csv = lotsToBatchCsv([
      {
        lot: "20A",
        title: 'Henry Repeating Arms H012X\nw/ sling, "extra" mag',
        currentBid: 500,
        requiredBid: 525,
        bidIncrementAmount: 25,
        bidCount: 2,
        imageUrls: [],
        kind: "firearm",
      },
    ]);
    const parsed = parseBatchSheet(csv);
    expect(parsed.rows[0]?.lot).toBe("20A");
    expect(parsed.rows[0]?.manufacturer).toBe("Henry");
    expect(parsed.rows[0]?.model.toUpperCase()).toBe("H012X");
    expect(parsed.rows[0]?.currentBid).toBe(500);
    expect(parsed.rows[0]?.accessories.join(" ")).toMatch(/sling/i);
  });

  it("warns when Current Bid is missing and a P25 column is sitting there", () => {
    const csv = "Lot,Title,OA sold P25 (comps, not a bid)\n1,Glock 19,409\n";
    const parsed = parseBatchSheet(csv);
    expect(parsed.rows[0]?.currentBid).toBeNull();
    expect(parsed.warnings.join(" ")).toMatch(/Current Bid/i);
    expect(parsed.warnings.join(" ")).toMatch(/P25|comp/i);
  });

  it("warns when Current Bid is empty on every lot", () => {
    const csv = "Lot,Title,Current Bid\n1,Glock 19,\n2,Ruger 10/22,\n";
    const parsed = parseBatchSheet(csv);
    expect(parsed.rows.every((r) => r.currentBid == null)).toBe(true);
    expect(parsed.warnings.join(" ")).toMatch(/empty on every lot/i);
  });

  it("does not read Current hammer from a re-pasted export as a comp column", () => {
    const csv = "Lot,Item,Current bid (ingested),OA sold P25 (comps, not a bid)\n20,LAR-15,350,409\n";
    const parsed = parseBatchSheet(csv);
    expect(parsed.rows[0]?.currentBid).toBe(350);
    expect(parsed.mapping["OA sold P25 (comps, not a bid)"]).toBeUndefined();
  });
});

describe("title annotations", () => {
  it("pulls w/ accessories and flags out of the model and warns on parts", () => {
    const parsed = parseTitleBlob("Remington Model 700 .308 w/ extra mag, scope, sporter, parts");
    expect(parsed.manufacturer).toBe("Remington");
    expect(parsed.model).toMatch(/700/);
    expect(parsed.model).not.toMatch(/scope|sporter|parts|w\//i);
    expect(parsed.accessories).toEqual(expect.arrayContaining(["extra mag", "scope"]));
    expect(parsed.flags).toEqual(expect.arrayContaining(["sporter", "parts"]));
    expect(parsed.partsWarning).toMatch(/parts/i);
    expect(parsed.category).toBe("rifle");
  });

  it("does not let pistol grip turn a rifle into a handgun", () => {
    expect(parseTitleBlob("Rock River LAR-15 5.56 with pistol grip").category).toBe("rifle");
    expect(parseTitleBlob("Windham WW-15 5.56 pistol grip").category).toBe("rifle");
    expect(parseTitleBlob("Winchester 94AE .30-30").category).toBe("rifle");
    expect(parseTitleBlob("Saiga-12").category).toBe("shotgun");
  });
});

describe("HiBid lot scope", () => {
  it("does not copy the next lot's bid across a long gap, and keeps 20A distinct from 20", () => {
    const html = `
      {"lot_number":"20","high_bid":350,"required_bid":375}
      ${"x".repeat(4000)}
      {"lot_number":"20A","high_bid":125,"required_bid":150}
    `;
    const meta = extractLotBidMetaFromHtml(html);
    expect(meta.get("20")?.highBid).toBe(350);
    expect(meta.get("20A")?.highBid).toBe(125);
    expect(meta.get("20")?.requiredBid).toBe(375);
  });
});

describe("BidWrangler asks", () => {
  it("labels a 0-bid opening amount as an ask", () => {
    const priced = bidWranglerLotPrice({
      accepted_bid_count: 0,
      ask_amount: 100,
      minimum_bid_amount: 100,
      high: { amount: 100 },
    });
    expect(priced.currentBid).toBeNull();
    expect(priced.openingAsk).toBe(100);
    expect(priced.bidKind).toBe("ask");
  });
});
