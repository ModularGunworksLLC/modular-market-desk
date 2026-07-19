/**
 * Proxibid category / browse ingest (guns-military-artifacts/*).
 * Parses Next.js __NEXT_DATA__ from public HTML — no browser session.
 */

import { AuctionIngestError, type AuctionIngestResult, type AuctionLot } from "@/lib/auctions/types";
import { classifyLotTitle } from "@/lib/auctions/lot-kind";

function classifyTitle(title: string): AuctionLot["kind"] {
  const kind = classifyLotTitle(title);
  if (kind === "accessory") return "other";
  return kind;
}

type ProxLot = {
  id?: string | number;
  lotId?: number;
  title?: string;
  price?: string;
  imageUrl?: string;
  lotDetailsUrl?: string;
  auctionHouseName?: string;
};

type ProxPageProps = {
  lotItems?: ProxLot[];
  pageInfo?: {
    current?: number;
    totalPages?: number;
    totalResults?: number;
    isLast?: boolean;
  };
  totalResults?: number;
};

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function extractNextData(html: string): ProxPageProps {
  const m = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/i,
  );
  if (!m?.[1]) {
    throw new AuctionIngestError(
      "Proxibid page missing __NEXT_DATA__ — layout may have changed; try CSV upload.",
      502,
    );
  }
  let parsed: { props?: { pageProps?: ProxPageProps } };
  try {
    parsed = JSON.parse(m[1]) as { props?: { pageProps?: ProxPageProps } };
  } catch {
    throw new AuctionIngestError("Proxibid __NEXT_DATA__ was not valid JSON.", 502);
  }
  const pageProps = parsed.props?.pageProps;
  if (!pageProps) {
    throw new AuctionIngestError("Proxibid __NEXT_DATA__ missing pageProps.", 502);
  }
  return pageProps;
}

function toLot(item: ProxLot, origin: string): AuctionLot | null {
  const title = (item.title ?? "").trim();
  if (!title) return null;
  const lotId = item.lotId ?? item.id;
  if (lotId == null) return null;
  const lot = String(lotId);
  const bid = parseMoney(item.price);
  const detail = item.lotDetailsUrl
    ? item.lotDetailsUrl.startsWith("http")
      ? item.lotDetailsUrl
      : `${origin}${item.lotDetailsUrl}`
    : undefined;
  const house = item.auctionHouseName?.trim();
  const fullTitle = house ? `${title} · ${house}` : title;

  return {
    lot,
    title: fullTitle,
    currentBid: bid,
    requiredBid: null,
    bidIncrementAmount: null,
    bidCount: 0,
    imageUrls: item.imageUrl ? [item.imageUrl] : [],
    kind: classifyTitle(title),
    detailUrl: detail,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (compatible; GunValueDesk/1.0; +https://desk.modulargunworks.com)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new AuctionIngestError(`Proxibid HTTP ${res.status}`, res.status === 404 ? 404 : 502);
  }
  return res.text();
}

function withPage(url: string, page: number): string {
  const u = new URL(url);
  if (page <= 1) u.searchParams.delete("page");
  else u.searchParams.set("page", String(page));
  return u.toString();
}

/**
 * Ingest Proxibid guns category browse pages.
 * Caps pages by default — category trees can be thousands of lots.
 */
export async function ingestProxibidCategory(
  url: string,
  opts?: { maxPages?: number },
): Promise<AuctionIngestResult> {
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    throw new AuctionIngestError("Invalid Proxibid URL.", 400);
  }
  if (!base.hostname.toLowerCase().includes("proxibid.com")) {
    throw new AuctionIngestError("Not a Proxibid URL.", 400);
  }

  const maxPages = Math.min(Math.max(opts?.maxPages ?? 5, 1), 20);
  const warnings: string[] = [];
  const all: AuctionLot[] = [];
  const seen = new Set<string>();
  const origin = `${base.protocol}//${base.host}`;

  let totalPages = 1;
  let totalResults = 0;

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = withPage(base.toString(), page);
    const html = await fetchHtml(pageUrl);
    const props = extractNextData(html);
    const items = Array.isArray(props.lotItems) ? props.lotItems : [];
    totalPages = props.pageInfo?.totalPages ?? totalPages;
    totalResults = props.pageInfo?.totalResults ?? props.totalResults ?? totalResults;

    if (items.length === 0) break;

    for (const item of items) {
      const lot = toLot(item, origin);
      if (!lot || seen.has(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
    }

    if (props.pageInfo?.isLast || page >= totalPages) break;
  }

  if (all.length === 0) {
    throw new AuctionIngestError("No Proxibid lots found on this page.", 404);
  }

  if (totalResults > all.length) {
    warnings.push(
      `Loaded ${all.length} of ~${totalResults} Proxibid results (capped at ${maxPages} pages). Narrow the category or raise maxPages.`,
    );
  }

  const firearmLots = all.filter((l) => l.kind === "firearm");

  return {
    auctionUrl: base.toString(),
    host: base.host,
    platform: "proxibid",
    lots: all,
    firearmLots,
    skipped: all.length - firearmLots.length,
    warnings,
    hasListingIncrements: false,
  };
}
