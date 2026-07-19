import { describe, expect, it } from "vitest";

import { auctionPlatformLabel, detectAuctionPlatform } from "./detect";

describe("detectAuctionPlatform", () => {
  it("detects HiBid houses", () => {
    expect(detectAuctionPlatform("https://bids.auctionbypearce.com/auctions/123")).toBe("hibid");
    expect(detectAuctionPlatform("https://www.hibid.com/auction/1")).toBe("hibid");
    expect(detectAuctionPlatform("https://fowlerauction.com/auctions/9")).toBe("hibid");
  });

  it("detects BidWrangler", () => {
    expect(
      detectAuctionPlatform("https://vanmassey.bidwrangler.com/ui/auctions/154595"),
    ).toBe("bidwrangler");
  });

  it("detects Proxibid", () => {
    expect(
      detectAuctionPlatform("https://www.proxibid.com/for-sale/guns-military-artifacts/guns"),
    ).toBe("proxibid");
  });

  it("rejects unknown hosts", () => {
    expect(detectAuctionPlatform("https://example.com/auction/1")).toBe("unknown");
    expect(auctionPlatformLabel("unknown")).toBe("Unknown");
  });
});
