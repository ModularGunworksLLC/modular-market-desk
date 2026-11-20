/**
 * Proxibid ingest:
 *  - Next.js category browse (`__NEXT_DATA__` / lotItems)
 *  - Classic event-catalog / Catalog.asp (lotListTitle + hidden currentBid)
 */

import { isProxibidEventCatalog } from "@/lib/auctions/detect";
import { assertAuctionHttpOk, fetchAuctionPage } from "@/lib/auctions/http";
import {
  buildIngestResult,
  cleanLotTitle,
  isPlaceholderLot,
  parseMoney,
  toAuctionKind,
} from "@/lib/auctions/util";
import { AuctionIngestError, type AuctionIngestResult, type AuctionLot } from "@/lib/auctions/types";

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

export function extractNextData(html: string): ProxPageProps | null {
  const m = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/i,
  );
  if (!m?.[1]) return null;
  let parsed: { props?: { pageProps?: ProxPageProps } };
  try {
    parsed = JSON.parse(m[1]) as { props?: { pageProps?: ProxPageProps } };
  } catch {
    return null;
  }
  return parsed.props?.pageProps ?? null;
}

function toBrowseLot(item: ProxLot, origin: string): AuctionLot | null {
  const title = (item.title ?? "").trim();
  if (!title) return null;
  const lotId = item.lotId ?? item.id;
  if (lotId == null) return null;
  const lot = String(lotId);
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
    currentBid: parseMoney(item.price),
    requiredBid: null,
    bidIncrementAmount: null,
    bidCount: 0,
    imageUrls: item.imageUrl ? [item.imageUrl] : [],
    kind: toAuctionKind(title),
    detailUrl: detail,
  };
}

/** Pure: classic Proxibid event-catalog lot tables. */
export function extractProxibidEventLots(html: string, origin: string): AuctionLot[] {
  const lots: AuctionLot[] = [];
  const re = /id="LotTable:(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const itemId = m[1];
    if (!itemId) continue;
    const next = html.indexOf('id="LotTable:', m.index + 12);
    const chunk = html.slice(m.index, next === -1 ? Math.min(html.length, m.index + 10000) : next);

    const titleM =
      chunk.match(/class="lotListTitle"[^>]*>[\s\S]*?>([^<]+)<\/a>/i) ??
      chunk.match(/<img[^>]+alt="([^"]+)"/i);
    const title = titleM?.[1] ? cleanLotTitle(titleM[1]) : "";
    if (title.length < 3) continue;

    const lotM =
      chunk.match(/id="lotNumber:\d+"[^>]*value="(\d+)"/i) ??
      chunk.match(/Lot\s*#\s*(\d+)/i);
    const lot = lotM?.[1] ?? itemId;
    if (isPlaceholderLot(lot)) continue;

    const bidM = chunk.match(/id="CurrentBid:\d+"[^>]*value="([^"]*)"/i);
    const hrefM = chunk.match(/href="([^"]*lotInformation[^"]*)"/i);
    const imgM = chunk.match(/<img[^>]+src="([^"]+)"/i);

    let detailUrl: string | undefined;
    const href = hrefM?.[1];
    if (href) {
      try {
        detailUrl = new URL(href, origin).toString();
      } catch {
        detailUrl = undefined;
      }
    }

    const imageUrl = imgM?.[1];
    lots.push({
      lot,
      title,
      currentBid: parseMoney(bidM?.[1] ?? null),
      requiredBid: null,
      bidIncrementAmount: null,
      bidCount: 0,
      imageUrls: imageUrl && !/paddle|spacer|blank/i.test(imageUrl) ? [imageUrl] : [],
      kind: toAuctionKind(title),
      detailUrl,
    });
  }
  return lots;
}

function withBrowsePage(url: string, page: number): string {
  const u = new URL(url);
  if (page <= 1) u.searchParams.delete("page");
  else u.searchParams.set("page", String(page));
  return u.toString();
}

function withEventPage(url: string, page: number): string {
  const u = new URL(url);
  u.hash = "";
  if (page <= 1) u.searchParams.delete("p");
  else u.searchParams.set("p", String(page));
  return u.toString();
}

function normalizeProxibidUrl(url: string): URL {
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    throw new AuctionIngestError("Invalid Proxibid URL.", 400);
  }
  if (!base.hostname.toLowerCase().includes("proxibid.com")) {
    throw new AuctionIngestError("Not a Proxibid URL.", 400);
  }
  base.hash = "";
  return base;
}

/**
 * Ingest Proxibid guns category browse pages.
 * Caps pages by default — category trees can be thousands of lots.
 */
export async function ingestProxibidCategory(
  url: string,
  opts?: { maxPages?: number },
): Promise<AuctionIngestResult> {
  const base = normalizeProxibidUrl(url);
  const maxPages = Math.min(Math.max(opts?.maxPages ?? 20, 1), 40);
  const warnings: string[] = [];
  const all: AuctionLot[] = [];
  const seen = new Set<string>();
  const origin = `${base.protocol}//${base.host}`;

  let totalPages = 1;
  let totalResults = 0;
  let pagesFetched = 0;
  let stoppedReason: AuctionIngestResult["stoppedReason"] = "complete";

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = withBrowsePage(base.toString(), page);
    const resp = await fetchAuctionPage(pageUrl);
    pagesFetched = page;
    assertAuctionHttpOk(resp.status, page, "Proxibid");
    const props = extractNextData(resp.html);
    if (!props) {
      if (page === 1) {
        throw new AuctionIngestError(
          "Proxibid page missing __NEXT_DATA__ — not a category browse page. Use an event-catalog URL or paste a CSV.",
          502,
        );
      }
      stoppedReason = "empty_page";
      break;
    }
    const items = Array.isArray(props.lotItems) ? props.lotItems : [];
    totalPages = props.pageInfo?.totalPages ?? totalPages;
    totalResults = props.pageInfo?.totalResults ?? props.totalResults ?? totalResults;

    if (items.length === 0) {
      stoppedReason = page === 1 ? "empty_page" : "no_new_lots";
      break;
    }

    let added = 0;
    for (const item of items) {
      const lot = toBrowseLot(item, origin);
      if (!lot || seen.has(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
      added += 1;
    }

    if (added === 0) {
      stoppedReason = "no_new_lots";
      break;
    }
    if (props.pageInfo?.isLast || page >= totalPages) {
      stoppedReason = "complete";
      break;
    }
    if (page === maxPages) {
      stoppedReason = "page_cap";
    }
  }

  if (all.length === 0) {
    throw new AuctionIngestError("No Proxibid lots found on this page.", 404);
  }

  if (totalResults > all.length) {
    warnings.push(
      `Loaded ${all.length} of ~${totalResults} Proxibid results (capped at ${maxPages} pages). Narrow the category or raise maxPages.`,
    );
  }

  return buildIngestResult({
    auctionUrl: base.toString(),
    host: base.host,
    platform: "proxibid",
    lots: all,
    warnings,
    pagesFetched,
    stoppedReason,
  });
}

export async function ingestProxibidEventCatalog(
  url: string,
  opts?: { maxPages?: number },
): Promise<AuctionIngestResult> {
  const base = normalizeProxibidUrl(url);
  base.searchParams.delete("p");
  const maxPages = Math.min(Math.max(opts?.maxPages ?? 40, 1), 60);
  const warnings: string[] = [];
  const all: AuctionLot[] = [];
  const seen = new Set<string>();
  const origin = `${base.protocol}//${base.host}`;
  let pagesFetched = 0;
  let stoppedReason: AuctionIngestResult["stoppedReason"] = "complete";

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = withEventPage(base.toString(), page);
    const resp = await fetchAuctionPage(pageUrl);
    pagesFetched = page;
    if (resp.status < 200 || resp.status >= 300) {
      if (page === 1) assertAuctionHttpOk(resp.status, page, "Proxibid");
      warnings.push(`Stopped Proxibid catalog pagination at page ${page} (HTTP ${resp.status}).`);
      stoppedReason = "http_error";
      break;
    }

    const lots = extractProxibidEventLots(resp.html, origin);
    let added = 0;
    for (const lot of lots) {
      if (seen.has(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
      added += 1;
    }

    if (lots.length === 0 || added === 0) {
      if (page === 1) {
        throw new AuctionIngestError(
          "No Proxibid event-catalog lots found — layout may have changed; try CSV upload on /batch.",
          404,
        );
      }
      stoppedReason = added === 0 ? "no_new_lots" : "empty_page";
      break;
    }
    // Do NOT stop when lots.length is "small" — event pages often show <10 tiles.
    if (page === maxPages) {
      stoppedReason = "page_cap";
      warnings.push(`Hit page cap (${maxPages}) with ${all.length} lots.`);
    }
  }

  if (all.length === 0) {
    throw new AuctionIngestError("No Proxibid lots found on this page.", 404);
  }

  return buildIngestResult({
    auctionUrl: base.toString(),
    host: base.host,
    platform: "proxibid",
    lots: all,
    warnings,
    pagesFetched,
    stoppedReason,
  });
}

export async function ingestProxibid(
  url: string,
  opts?: { maxPages?: number },
): Promise<AuctionIngestResult> {
  if (isProxibidEventCatalog(url)) {
    return ingestProxibidEventCatalog(url, opts);
  }
  return ingestProxibidCategory(url, opts);
}
