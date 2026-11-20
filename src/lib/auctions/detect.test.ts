import { describe, expect, it } from "vitest";

import {
  auctionPlatformLabel,
  detectAuctionPlatform,
  detectAuctionTarget,
  isLiveAuctioneersUrl,
  parseHibidCatalogId,
} from "./detect";

describe("detectAuctionPlatform", () => {
  it("detects HiBid houses", () => {
    expect(detectAuctionPlatform("https://bids.auctionbypearce.com/auctions/123")).toBe("hibid");
    expect(detectAuctionPlatform("https://www.hibid.com/auction/1")).toBe("hibid");
    expect(detectAuctionPlatform("https://fowlerauction.com/auctions/9")).toBe("hibid");
    expect(detectAuctionPlatform("https://bids.christys.com/auctions/47838-guns")).toBe("hibid");
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
    expect(
      detectAuctionPlatform(
        "https://www.proxibid.com/Connecticut-Firearms-Auction/August-2026-Online-Only-Auction/event-catalog/299076",
      ),
    ).toBe("proxibid");
  });

  it("rejects unknown hosts", () => {
    expect(detectAuctionPlatform("https://example.com/auction/1")).toBe("unknown");
    expect(auctionPlatformLabel("unknown")).toBe("Unknown");
  });
});

describe("detectAuctionTarget", () => {
  it("marks HiBid.com / house-subdomain catalog paths as catalog", () => {
    expect(
      detectAuctionTarget("https://hibid.com/catalog/767971/big-guns--by-trigger-shack"),
    ).toEqual({ platform: "hibid", variant: "catalog" });
    expect(
      detectAuctionTarget(
        "https://gunauctionsusa.hibid.com/catalog/759589/gun-auctions-usa---glocks-to-garands--106",
      ),
    ).toEqual({ platform: "hibid", variant: "catalog" });
    expect(parseHibidCatalogId("https://gunauctionsusa.hibid.com/catalog/759589/x")).toBe("759589");
  });

  it("marks bids.* auction lists as white-label", () => {
    expect(
      detectAuctionTarget("https://bids.auctionbypearce.com/auctions/48128-boom"),
    ).toEqual({ platform: "hibid", variant: "white-label" });
  });

  it("marks Proxibid event-catalog vs browse", () => {
    expect(
      detectAuctionTarget(
        "https://www.proxibid.com/Connecticut-Firearms-Auction/x/event-catalog/299076?p=2",
      ),
    ).toEqual({ platform: "proxibid", variant: "event" });
    expect(
      detectAuctionTarget("https://www.proxibid.com/for-sale/guns-military-artifacts/guns"),
    ).toEqual({ platform: "proxibid", variant: "browse" });
  });

  it("identifies LiveAuctioneers without claiming support", () => {
    const url = "https://www.liveauctioneers.com/catalog/427714_firearm-modern-sporting-tactical/";
    expect(isLiveAuctioneersUrl(url)).toBe(true);
    expect(detectAuctionTarget(url)).toEqual({ platform: "unknown", variant: "none" });
  });
});
