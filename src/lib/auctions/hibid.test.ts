import { describe, expect, it } from "vitest";

import { lotsToBatchCsv } from "@/lib/auctions/hibid";
import type { AuctionLot } from "@/lib/auctions/types";
import { normalizeSerial } from "@/lib/stolen/hotgunz";

describe("normalizeSerial", () => {
  it("strips punctuation", () => {
    expect(normalizeSerial("ab-12 34")).toBe("AB1234");
  });
});

describe("lotsToBatchCsv", () => {
  it("emits header and quoted titles", () => {
    const lots: AuctionLot[] = [
      {
        lot: "10",
        title: 'Glock 19 Gen5 9mm "optics"',
        currentBid: 400,
        bidCount: 3,
        imageUrls: [],
        kind: "firearm",
      },
    ];
    const csv = lotsToBatchCsv(lots, 15);
    expect(csv.split("\n")[0]).toContain("Lot,Title");
    expect(csv).toContain("10,");
    expect(csv).toContain("400");
    expect(csv).toContain("15");
  });
});
