import { describe, expect, it } from "vitest";

import {
  computeNextBid,
  DEFAULT_BID_INCREMENTS,
  walkAwayLegalBid,
} from "@/lib/auctions/bid-increments";
import { lotsToBatchCsv } from "@/lib/auctions/hibid";
import type { AuctionLot } from "@/lib/auctions/types";
import { normalizeSerial } from "@/lib/stolen/hotgunz";

describe("normalizeSerial", () => {
  it("strips punctuation", () => {
    expect(normalizeSerial("ab-12 34")).toBe("AB1234");
  });
});

describe("bid increments", () => {
  it("uses listing required_bid when present", () => {
    expect(
      computeNextBid(350, DEFAULT_BID_INCREMENTS, { requiredBid: 375, incrementAmount: 25 }),
    ).toBe(375);
  });

  it("falls back to settings schedule", () => {
    expect(computeNextBid(350, DEFAULT_BID_INCREMENTS, null)).toBe(375);
    expect(computeNextBid(90, DEFAULT_BID_INCREMENTS, null)).toBe(95);
    expect(computeNextBid(20, DEFAULT_BID_INCREMENTS, null)).toBe(21);
    expect(computeNextBid(1000, DEFAULT_BID_INCREMENTS, null)).toBe(1050);
  });

  it("floors max bid to a legal walk-away step", () => {
    expect(walkAwayLegalBid(358.17, DEFAULT_BID_INCREMENTS, { incrementAmount: 25 })).toBe(350);
  });

  it("marks next bid over max as the Rem 1100 trap", () => {
    const next = computeNextBid(350, DEFAULT_BID_INCREMENTS, { requiredBid: 375 });
    const maxBid = 358.17;
    expect(next).toBe(375);
    expect(next! > maxBid).toBe(true);
  });
});

describe("lotsToBatchCsv", () => {
  it("emits header and quoted titles with required bid columns", () => {
    const lots: AuctionLot[] = [
      {
        lot: "10",
        title: 'Glock 19 Gen5 9mm "optics"',
        currentBid: 400,
        requiredBid: 425,
        bidIncrementAmount: 25,
        bidCount: 3,
        imageUrls: [],
        kind: "firearm",
      },
    ];
    const csv = lotsToBatchCsv(lots, 15);
    expect(csv.split("\n")[0]).toContain("Required Bid");
    expect(csv).toContain("10,");
    expect(csv).toContain("400");
    expect(csv).toContain("425");
    expect(csv).toContain("25");
    expect(csv).toContain("15");
  });
});
