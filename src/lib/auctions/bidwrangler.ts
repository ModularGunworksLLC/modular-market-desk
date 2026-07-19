/**
 * BidWrangler auction ingest (e.g. vanmassey.bidwrangler.com).
 * Uses the public JSON API — no browser session.
 */

import { AuctionIngestError, type AuctionIngestResult, type AuctionLot } from "@/lib/auctions/types";
import { classifyLotTitle } from "@/lib/auctions/lot-kind";

function classifyTitle(title: string): AuctionLot["kind"] {
  const kind = classifyLotTitle(title);
  if (kind === "accessory") return "other";
  return kind;
}

/** Extract numeric auction id from a BidWrangler UI or API URL. */
export function parseBidWranglerAuctionId(url: string): number | null {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes("bidwrangler.com")) return null;
    const m =
      u.pathname.match(/\/(?:ui\/)?auctions\/(\d+)/i) ??
      u.pathname.match(/\/api\/auctions\/(\d+)/i);
    if (!m?.[1]) return null;
    const id = Number.parseInt(m[1], 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function companyOrigin(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

type BwBidState = {
  accepted_bid_count?: number;
  high?: { amount?: number } | null;
  ask_amount?: number | null;
  minimum_bid_amount?: number | null;
  next_increment?: number | null;
  closing_bid?: { amount?: number } | null;
};

type BwItem = {
  lot_identifier?: string | number | null;
  sequence?: number | null;
  name?: string | null;
  name_with_prefix?: string | null;
  api_bidding_state?: BwBidState | null;
  images?: Array<{ sm?: string; lg?: string; xs?: string }> | null;
  details_url?: string | null;
};

function money(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return n;
}

function itemToLot(item: BwItem, origin: string): AuctionLot | null {
  const lotRaw = item.lot_identifier ?? item.sequence;
  if (lotRaw == null || lotRaw === "") return null;
  const lot = String(lotRaw).trim();
  if (!lot || ["0", "00", "000"].includes(lot)) return null;

  const title = (item.name ?? item.name_with_prefix ?? "").trim();
  if (!title) return null;

  const state = item.api_bidding_state ?? {};
  const soldHammer = money(state.closing_bid?.amount) ?? money(state.high?.amount);
  const currentBid = soldHammer ?? money(state.ask_amount) ?? money(state.minimum_bid_amount);
  const requiredBid = money(state.minimum_bid_amount) ?? money(state.ask_amount);
  const bidIncrementAmount = money(state.next_increment);

  const imageUrls = (item.images ?? [])
    .map((img) => img.lg ?? img.sm ?? img.xs)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  return {
    lot,
    title,
    currentBid,
    requiredBid: requiredBid != null && requiredBid > 0 ? requiredBid : null,
    bidIncrementAmount:
      bidIncrementAmount != null && bidIncrementAmount > 0 ? bidIncrementAmount : null,
    bidCount: typeof state.accepted_bid_count === "number" ? state.accepted_bid_count : 0,
    imageUrls,
    kind: classifyTitle(title),
    detailUrl: item.details_url
      ? item.details_url.startsWith("http")
        ? item.details_url
        : `${origin}${item.details_url}`
      : undefined,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "GunValueDesk/1.0" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new AuctionIngestError(
      `BidWrangler HTTP ${res.status} for ${url}`,
      res.status === 404 ? 404 : 502,
    );
  }
  return res.json() as Promise<unknown>;
}

/**
 * Ingest a BidWrangler auction catalog into normalized lots.
 * Paginates `/api/auctions/{id}/items?page=N`.
 */
export async function ingestBidWranglerAuction(
  url: string,
  opts?: { maxPages?: number },
): Promise<AuctionIngestResult> {
  const auctionId = parseBidWranglerAuctionId(url);
  if (auctionId == null) {
    throw new AuctionIngestError(
      "Not a BidWrangler auction URL (expected …/auctions/{id}).",
      400,
    );
  }

  const origin = companyOrigin(url);
  const maxPages = Math.min(Math.max(opts?.maxPages ?? 40, 1), 60);
  const warnings: string[] = [];
  const all: AuctionLot[] = [];
  const seen = new Set<string>();

  // Prefer items endpoint (paginated). Fall back to embedded items on auction payload.
  let page = 1;
  let usedItemsEndpoint = true;

  while (page <= maxPages) {
    const endpoint = `${origin}/api/auctions/${auctionId}/items?page=${page}&per_page=50`;
    let payload: unknown;
    try {
      payload = await fetchJson(endpoint);
    } catch (err) {
      if (page === 1 && err instanceof AuctionIngestError) {
        usedItemsEndpoint = false;
        break;
      }
      throw err;
    }

    const items: BwItem[] = Array.isArray(payload)
      ? (payload as BwItem[])
      : Array.isArray((payload as { items?: BwItem[] }).items)
        ? ((payload as { items: BwItem[] }).items)
        : [];

    if (items.length === 0) break;

    for (const item of items) {
      const lot = itemToLot(item, origin);
      if (!lot || seen.has(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
    }

    if (items.length < 25) break;
    page += 1;
  }

  if (!usedItemsEndpoint || all.length === 0) {
    const auction = (await fetchJson(`${origin}/api/auctions/${auctionId}`)) as {
      items?: BwItem[];
      items_count?: number;
      name?: string;
    };
    const items = Array.isArray(auction.items) ? auction.items : [];
    if (items.length === 0 && all.length === 0) {
      throw new AuctionIngestError(
        "BidWrangler returned no lots — auction may be private or removed.",
        404,
      );
    }
    for (const item of items) {
      const lot = itemToLot(item, origin);
      if (!lot || seen.has(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
    }
    if (typeof auction.items_count === "number" && auction.items_count > all.length) {
      warnings.push(
        `Only ${all.length} of ${auction.items_count} lots on first auction payload — items pagination may be limited.`,
      );
    }
  }

  const firearmLots = all.filter((l) => l.kind === "firearm");
  const hasListingIncrements = all.some(
    (l) =>
      (l.requiredBid != null && l.requiredBid > 0) ||
      (l.bidIncrementAmount != null && l.bidIncrementAmount > 0),
  );

  return {
    auctionUrl: `${origin}/ui/auctions/${auctionId}`,
    host: new URL(origin).host,
    platform: "bidwrangler",
    lots: all,
    firearmLots,
    skipped: all.length - firearmLots.length,
    warnings,
    hasListingIncrements,
  };
}
