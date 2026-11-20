/** Detect auction platform family from a catalog / lot-list URL. */

export type AuctionPlatform = "hibid" | "bidwrangler" | "proxibid" | "unknown";

export type AuctionVariant = "white-label" | "catalog" | "api" | "event" | "browse" | "none";

export interface AuctionTarget {
  platform: AuctionPlatform;
  variant: AuctionVariant;
}

export function parseHibidCatalogId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes("hibid.com")) return null;
    const m = u.pathname.match(/\/catalog\/(\d+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isProxibidEventCatalog(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes("proxibid.com")) return false;
    const path = u.pathname.toLowerCase();
    return path.includes("/event-catalog/") || path.includes("catalog.asp");
  } catch {
    return false;
  }
}

export function isLiveAuctioneersUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("liveauctioneers.com");
  } catch {
    return false;
  }
}

export function detectAuctionTarget(url: string): AuctionTarget {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { platform: "unknown", variant: "none" };
  }

  if (host.includes("bidwrangler.com")) return { platform: "bidwrangler", variant: "api" };

  if (host.includes("proxibid.com")) {
    return {
      platform: "proxibid",
      variant: isProxibidEventCatalog(url) ? "event" : "browse",
    };
  }

  if (host.includes("hibid.com")) {
    return {
      platform: "hibid",
      variant: parseHibidCatalogId(url) ? "catalog" : "white-label",
    };
  }

  // HiBid white-label houses: bids.*.com, Pearce, Fowler, etc.
  if (host.startsWith("bids.") || host.includes("auctionbypearce") || host.includes("fowlerauction")) {
    return { platform: "hibid", variant: "white-label" };
  }

  return { platform: "unknown", variant: "none" };
}

export function detectAuctionPlatform(url: string): AuctionPlatform {
  return detectAuctionTarget(url).platform;
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
