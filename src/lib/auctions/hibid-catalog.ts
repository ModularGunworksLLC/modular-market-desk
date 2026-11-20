/**
 * HiBid.com / *.hibid.com catalog ingest (Trigger Shack, Gun Auctions USA).
 * House subdomains are a PWA shell — always fetch www.hibid.com/catalog/{id}.
 */

import { extractHibidMarkdownLots } from "@/lib/auctions/hibid";
import { parseHibidCatalogId } from "@/lib/auctions/detect";
import { assertAuctionHttpOk, fetchAuctionPage } from "@/lib/auctions/http";
import {
  buildIngestResult,
  cleanLotTitle,
  isPlaceholderLot,
  readJsonNumber,
  readJsonString,
  toAuctionKind,
} from "@/lib/auctions/util";
import { AuctionIngestError, type AuctionIngestResult, type AuctionLot } from "@/lib/auctions/types";

export function canonicalHibidCatalogUrl(
  catalogId: string,
  page = 1,
  pageSize = 100,
): string {
  const u = new URL(`https://www.hibid.com/catalog/${catalogId}`);
  u.searchParams.set("page", String(page));
  u.searchParams.set("pageSize", String(pageSize));
  return u.toString();
}

function lastJsonStringBefore(html: string, key: string, end: number): string | null {
  const start = Math.max(0, end - 2800);
  const slice = html.slice(start, end);
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "g");
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    try {
      last = JSON.parse(`"${raw}"`) as string;
    } catch {
      last = raw.replace(/\\"/g, '"');
    }
  }
  return last;
}

/** Pure: Apollo-style catalog JSON embedded in HiBid.com HTML. */
export function extractHibidCatalogLots(html: string): AuctionLot[] {
  const lots: AuctionLot[] = [];
  const seen = new Set<string>();
  const re = /"lotNumber"\s*:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const lot = m[1];
    if (!lot || isPlaceholderLot(lot) || seen.has(lot)) continue;
    const title = cleanLotTitle(lastJsonStringBefore(html, "lead", m.index) ?? "");
    if (title.length < 3) continue;

    const after = html.slice(m.index, Math.min(html.length, m.index + 2500));
    const highBid = readJsonNumber(after, "highBid");
    const minBid = readJsonNumber(after, "minBid");
    const bidCount = readJsonNumber(after, "bidCount");
    const thumb = readJsonString(after, "thumbnailLocation");

    seen.add(lot);
    lots.push({
      lot,
      title,
      currentBid: highBid != null && highBid > 0 ? highBid : null,
      requiredBid: minBid != null && minBid > 0 ? minBid : null,
      bidIncrementAmount: null,
      bidCount: bidCount != null && bidCount > 0 ? Math.round(bidCount) : 0,
      imageUrls: thumb && /^https?:/i.test(thumb) ? [thumb] : [],
      kind: toAuctionKind(title),
    });
  }
  return lots;
}

export async function ingestHibidCatalog(
  auctionUrl: string,
  opts?: { maxPages?: number; pageSize?: number },
): Promise<AuctionIngestResult> {
  const catalogId = parseHibidCatalogId(auctionUrl);
  if (!catalogId) {
    throw new AuctionIngestError("Not a HiBid catalog URL (expected …/catalog/{id}).", 400);
  }

  const maxPages = Math.min(Math.max(opts?.maxPages ?? 40, 1), 60);
  const pageSize = opts?.pageSize ?? 100;
  const warnings: string[] = [];
  const all: AuctionLot[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  let stoppedReason: AuctionIngestResult["stoppedReason"] = "complete";

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = canonicalHibidCatalogUrl(catalogId, page, pageSize);
    const resp = await fetchAuctionPage(pageUrl);
    pagesFetched = page;
    if (resp.status < 200 || resp.status >= 300) {
      if (page === 1) assertAuctionHttpOk(resp.status, page, "HiBid catalog");
      warnings.push(`Stopped HiBid catalog pagination at page ${page} (HTTP ${resp.status}).`);
      stoppedReason = "http_error";
      break;
    }

    if (page === 1 && resp.via === "jina") {
      warnings.push("HiBid catalog blocked the desk IP — loaded lots via reader fallback.");
    }

    if (page === 1 && resp.html.length < 20_000 && !resp.html.includes("lotNumber") && !/^Lot\s+\d+:/m.test(resp.html)) {
      throw new AuctionIngestError(
        "HiBid catalog page had no lot data (app shell or block). Try www.hibid.com/catalog/{id} or paste a CSV.",
        502,
      );
    }

    let lots = extractHibidCatalogLots(resp.html);
    if (lots.length === 0) lots = extractHibidMarkdownLots(resp.html, pageUrl);
    let added = 0;
    for (const lot of lots) {
      if (seen.has(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
      added += 1;
    }

    if (lots.length === 0) {
      stoppedReason = page === 1 ? "empty_page" : "empty_page";
      if (page > 1) warnings.push(`No lots parsed on catalog page ${page} — stopped after ${all.length} lots.`);
      break;
    }
    if (added === 0) {
      stoppedReason = "no_new_lots";
      break;
    }
    if (page === maxPages) {
      stoppedReason = "page_cap";
      warnings.push(`Hit page cap (${maxPages}) with ${all.length} lots — raise maxPages if the sale is larger.`);
    }
  }

  if (all.length === 0) {
    throw new AuctionIngestError(
      "No HiBid catalog lots found — layout may have changed; try CSV upload on /batch.",
      404,
    );
  }

  return buildIngestResult({
    auctionUrl: `https://www.hibid.com/catalog/${catalogId}`,
    host: "www.hibid.com",
    platform: "hibid",
    lots: all,
    warnings,
    pagesFetched,
    stoppedReason,
  });
}
