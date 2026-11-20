import { describe, expect, it } from "vitest";

import { defaultIngestPages, ingestAuction } from "./ingest";
import { detectAuctionTarget } from "./detect";

describe("defaultIngestPages", () => {
  it("sizes pages by family variant", () => {
    expect(defaultIngestPages({ platform: "proxibid", variant: "event" })).toBe(40);
    expect(defaultIngestPages({ platform: "proxibid", variant: "browse" })).toBe(20);
    expect(defaultIngestPages({ platform: "hibid", variant: "catalog" })).toBe(40);
    expect(defaultIngestPages({ platform: "hibid", variant: "white-label" })).toBe(40);
    expect(defaultIngestPages({ platform: "bidwrangler", variant: "api" })).toBe(40);
  });
});

describe("ingestAuction routing", () => {
  it("rejects LiveAuctioneers with a HiBid/CSV fallback", async () => {
    await expect(
      ingestAuction("https://www.liveauctioneers.com/catalog/427714_firearm-modern-sporting-tactical/"),
    ).rejects.toThrow(/LiveAuctioneers/);
  });

  it("rejects unknown hosts", async () => {
    await expect(ingestAuction("https://example.com/auction/1")).rejects.toThrow(/Unsupported auction URL/);
  });

  it("classifies the operator's current book", () => {
    expect(
      detectAuctionTarget("https://bids.auctionbypearce.com/auctions/48128-boom"),
    ).toEqual({ platform: "hibid", variant: "white-label" });
    expect(
      detectAuctionTarget("https://gunauctionsusa.hibid.com/catalog/759589/glocks"),
    ).toEqual({ platform: "hibid", variant: "catalog" });
    expect(
      detectAuctionTarget("https://vanmassey.bidwrangler.com/ui/auctions/166359"),
    ).toEqual({ platform: "bidwrangler", variant: "api" });
    expect(
      detectAuctionTarget(
        "https://www.proxibid.com/Connecticut-Firearms-Auction/x/event-catalog/299076?p=2",
      ),
    ).toEqual({ platform: "proxibid", variant: "event" });
  });
});
