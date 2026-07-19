/** Detect auction platform family from a catalog / lot-list URL. */

export type AuctionPlatform = "hibid" | "bidwrangler" | "proxibid" | "unknown";

export function detectAuctionPlatform(url: string): AuctionPlatform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  if (host.includes("bidwrangler.com")) return "bidwrangler";
  if (host.includes("proxibid.com")) return "proxibid";

  // HiBid houses: bids.*.com, *.hibid.com, auctionbypearce, fowlerauction, etc.
  if (
    host.includes("hibid.com") ||
    host.startsWith("bids.") ||
    host.includes("auctionbypearce") ||
    host.includes("fowlerauction")
  ) {
    return "hibid";
  }

  return "unknown";
}

export function auctionPlatformLabel(platform: AuctionPlatform): string {
  switch (platform) {
    case "hibid":
      return "HiBid";
    case "bidwrangler":
      return "BidWrangler";
    case "proxibid":
      return "Proxibid";
    default:
      return "Unknown";
  }
}
