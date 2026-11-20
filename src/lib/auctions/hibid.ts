/**
 * HiBid white-label ingest (Pearce / Fowler / Christy's / bids.*.com).
 * Handles the older `class="title"` tile and the newer `lot-tile-two` / `lot-title` tile.
 */

import { fetchAuctionPage, assertAuctionHttpOk } from "@/lib/auctions/http";
import {
  buildIngestResult,
  cleanLotTitle,
  isPlaceholderLot,
  parseMoney,
  stripTags,
  toAuctionKind,
} from "@/lib/auctions/util";
import { AuctionIngestError, type AuctionIngestResult, type AuctionLot } from "@/lib/auctions/types";

export { AuctionIngestError } from "@/lib/auctions/types";
export { lotsToBatchCsv } from "@/lib/auctions/csv";

type LotBidMeta = {
  requiredBid: number | null;
  bidIncrementAmount: number | null;
  highBid: number | null;
};

/** Pull per-lot required_bid / bid_increment_amount from embedded HiBid Apollo JSON. */
export function extractLotBidMetaFromHtml(html: string): Map<string, LotBidMeta> {
  const map = new Map<string, LotBidMeta>();
  const re = /"lot_number"\s*:\s*"?(\d+)"?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const lot = m[1];
    if (!lot) continue;
    const slice = html.slice(m.index, m.index + 3500);
    const reqM = slice.match(/"required_bid"\s*:\s*([\d.]+)/);
    const incM = slice.match(/"bid_increment_amount"\s*:\s*([\d.]+)/);
    const highM =
      slice.match(/"high_bid"\s*:\s*([\d.]+)/) ||
      slice.match(/"winning_bid_amount"\s*:\s*([\d.]+)/) ||
      slice.match(/"current_bid"\s*:\s*([\d.]+)/);
    const requiredBid = reqM?.[1] ? Number(reqM[1]) : null;
    const bidIncrementAmount = incM?.[1] ? Number(incM[1]) : null;
    const highBid = highM?.[1] ? Number(highM[1]) : null;
    const prev = map.get(lot);
    map.set(lot, {
      requiredBid:
        requiredBid != null && Number.isFinite(requiredBid)
          ? requiredBid
          : (prev?.requiredBid ?? null),
      bidIncrementAmount:
        bidIncrementAmount != null && Number.isFinite(bidIncrementAmount)
          ? bidIncrementAmount
          : (prev?.bidIncrementAmount ?? null),
      highBid: highBid != null && Number.isFinite(highBid) ? highBid : (prev?.highBid ?? null),
    });
  }
  return map;
}

function extractHibidCardTitle(chunk: string): string | null {
  const lotTitle =
    chunk.match(/class="lot-title"[^>]*>([\s\S]*?)<\/div>\s*<div class="lotDescription"/i) ??
    chunk.match(/class="lot-title"[^>]*>([\s\S]*?)<\/div>/i);
  if (lotTitle?.[1]) {
    const text = cleanLotTitle(stripTags(lotTitle[1]).replace(/Lot\s+\d+/i, ""));
    if (text.length >= 3) return text;
  }
  const old = chunk.match(/class="title">([^<]+)/);
  if (old?.[1]) {
    const text = cleanLotTitle(old[1]);
    if (text.length >= 3) return text;
  }
  const alt = chunk.match(/<img[^>]+alt="([^"]+)"/i);
  if (alt?.[1] && !/logo|spacer|pixel|blank/i.test(alt[1])) {
    const text = cleanLotTitle(alt[1]);
    if (text.length >= 3) return text;
  }
  return null;
}

function extractHibidCardBid(chunk: string): number | null {
  const tile = chunk.match(/class="tile-two-winning-bid">\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  if (tile?.[1]) return parseMoney(tile[1]);
  const old = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
  if (old?.[1]) return parseMoney(old[1]);
  return null;
}

/** Pure: white-label lot cards + Apollo bid meta → AuctionLot[]. */
export function extractHibidWhiteLabelLots(html: string, baseUrl: string): AuctionLot[] {
  const bidMeta = extractLotBidMetaFromHtml(html);
  const lots: AuctionLot[] = [];
  const re = /data-lotnumber="(\d+)"/gi;
  let block: RegExpExecArray | null;
  while ((block = re.exec(html)) !== null) {
    const lot = block[1];
    if (!lot || isPlaceholderLot(lot)) continue;
    const next = html.indexOf("data-lotnumber=", block.index + 16);
    const chunk = html.slice(block.index, next === -1 ? Math.min(html.length, block.index + 12000) : next);
    const title = extractHibidCardTitle(chunk);
    if (!title) continue;

    const bidsM = chunk.match(/<strong>Bids:<\/strong>\s*<span>(\d+)<\/span>/i);
    const imgMs = [...chunk.matchAll(/<img[^>]+src="([^"]+)"/gi)]
      .map((m) => m[1])
      .filter((u): u is string => Boolean(u));
    const hrefM = chunk.match(/href="([^"]*lot-details[^"]*)"/i) || chunk.match(/href="([^"]+)"/);
    const imageUrls = imgMs
      .map((u) => {
        try {
          return new URL(u, baseUrl).toString();
        } catch {
          return u;
        }
      })
      .filter((u) => !/spacer|pixel|blank|logo/i.test(u));

    let detailUrl: string | undefined;
    const href = hrefM?.[1];
    if (href) {
      try {
        detailUrl = new URL(href, baseUrl).toString();
      } catch {
        detailUrl = undefined;
      }
    }

    const meta = bidMeta.get(lot);
    lots.push({
      lot,
      title,
      currentBid: extractHibidCardBid(chunk) ?? meta?.highBid ?? null,
      requiredBid: meta?.requiredBid ?? null,
      bidIncrementAmount: meta?.bidIncrementAmount ?? null,
      bidCount: bidsM?.[1] ? parseInt(bidsM[1], 10) : 0,
      imageUrls: [...new Set(imageUrls)].slice(0, 6),
      kind: toAuctionKind(title),
      detailUrl,
    });
  }
  return lots;
}

/**
 * Jina-reader markdown of HiBid white-label list pages:
 *   Lot 10:Glock 17 9x19 Pistol
 *   $725.00
 *   **Bids:**20
 *   [View Lot Details Now](https://bids…/lot/…)
 */
export function extractHibidMarkdownLots(markdown: string, baseUrl: string): AuctionLot[] {
  const lots: AuctionLot[] = [];
  const re = /^Lot\s+(\d+):\s*(.+)$/gm;
  const matches = [...markdown.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const lot = m[1];
    if (!lot || isPlaceholderLot(lot)) continue;
    const title = cleanLotTitle(m[2] ?? "");
    if (title.length < 3) continue;
    if (/auction information|shipping information/i.test(title)) continue;

    const start = m.index ?? 0;
    const end = matches[i + 1]?.index ?? markdown.length;
    const chunk = markdown.slice(start, end);
    const moneyMs = [...chunk.matchAll(/\$([0-9,]+(?:\.\d{2})?)/g)];
    const lastMoney = moneyMs.length > 0 ? moneyMs[moneyMs.length - 1]?.[1] : null;
    const bidsM = chunk.match(/\*\*Bids:\*\*\s*(\d+)/i) ?? chunk.match(/Bids:\*\*\s*(\d+)/i);
    const hrefM =
      chunk.match(/\((https?:\/\/[^)\s]+\/lot\/[^)\s]+)\)/i) ??
      chunk.match(/\((https?:\/\/[^)\s]*lot-details[^)\s]*)\)/i);
    const imgM = chunk.match(/!\[.*?\]\((https?:\/\/[^)\s]+)\)/);

    let detailUrl: string | undefined;
    const href = hrefM?.[1];
    if (href) {
      try {
        detailUrl = new URL(href, baseUrl).toString();
      } catch {
        detailUrl = href;
      }
    }

    const imageUrls: string[] = [];
    if (imgM?.[1] && !/spacer|pixel|blank|logo/i.test(imgM[1])) {
      try {
        imageUrls.push(new URL(imgM[1], baseUrl).toString());
      } catch {
        imageUrls.push(imgM[1]);
      }
    }

    lots.push({
      lot,
      title,
      currentBid: parseMoney(lastMoney),
      requiredBid: null,
      bidIncrementAmount: null,
      bidCount: bidsM?.[1] ? parseInt(bidsM[1], 10) : 0,
      imageUrls,
      kind: toAuctionKind(title),
      detailUrl,
    });
  }
  return lots;
}

function extractHibidLots(body: string, baseUrl: string): AuctionLot[] {
  const htmlLots = extractHibidWhiteLabelLots(body, baseUrl);
  if (htmlLots.length > 0) return htmlLots;
  return extractHibidMarkdownLots(body, baseUrl);
}

function normalizeAuctionUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new AuctionIngestError("Invalid auction URL.");
  }
  if (!/^https?:$/i.test(u.protocol)) {
    throw new AuctionIngestError("Auction URL must be http(s).");
  }
  u.hash = "";
  return u;
}

/** HiBid list filters (`end_time_from:now`, category, search) hide lots — ingest the whole sale. */
const HIBID_BROWSE_PARAMS = new Set([
  "filter",
  "status",
  "q",
  "query",
  "search",
  "sort",
  "sortdir",
  "category",
]);

export function hibidAuctionHadBrowseFilter(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return [...u.searchParams.keys()].some((k) => HIBID_BROWSE_PARAMS.has(k.toLowerCase()));
  } catch {
    return false;
  }
}

export function hibidWhiteLabelPageUrl(auctionUrl: string, page: number, pageSize: number): string {
  const u = normalizeAuctionUrl(auctionUrl);
  for (const key of [...u.searchParams.keys()]) {
    u.searchParams.delete(key);
  }
  u.searchParams.set("page", String(page));
  u.searchParams.set("pageSize", String(pageSize));
  return u.toString();
}

/**
 * Fetch paginated HiBid white-label list pages and return classified lots.
 */
export async function ingestHibidAuction(
  auctionUrl: string,
  opts?: { maxPages?: number; pageSize?: number },
): Promise<AuctionIngestResult> {
  const base = normalizeAuctionUrl(auctionUrl);
  const maxPages = Math.min(Math.max(opts?.maxPages ?? 40, 1), 60);
  // Many white-label houses show 24–48 tiles; requesting 100 is fine but do NOT
  // treat a short page as end-of-catalog (that was the "first page only" bug).
  const pageSize = opts?.pageSize ?? 100;
  const warnings: string[] = [];
  const all: AuctionLot[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  let stoppedReason: AuctionIngestResult["stoppedReason"] = "complete";

  if (hibidAuctionHadBrowseFilter(auctionUrl)) {
    warnings.push("Ignored HiBid list filters (open-now / category / search) so the full catalog is loaded.");
  }

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = hibidWhiteLabelPageUrl(auctionUrl, page, pageSize);

    const resp = await fetchAuctionPage(pageUrl);
    pagesFetched = page;
    if (resp.status < 200 || resp.status >= 300) {
      if (page === 1) {
        assertAuctionHttpOk(resp.status, page, "HiBid");
      }
      warnings.push(`Stopped pagination at page ${page} (HTTP ${resp.status}).`);
      stoppedReason = "http_error";
      break;
    }

    if (page === 1 && resp.via === "jina") {
      warnings.push("HiBid blocked the desk IP — loaded lots via reader fallback.");
    }

    // Prefer HTML cards; fall back to markdown (Jina). Never treat empty extract
    // on page 2+ as end-of-catalog if we already have lots — retry markdown path.
    let lots = extractHibidWhiteLabelLots(resp.html, pageUrl);
    if (lots.length === 0) {
      lots = extractHibidMarkdownLots(resp.html, pageUrl);
    }
    if (lots.length === 0) {
      if (page === 1) {
        warnings.push(
          "No lot cards matched HiBid markup — site layout may have changed; try CSV upload on /batch.",
        );
        stoppedReason = "empty_page";
        break;
      }
      // Empty extract after we already have lots: stop (likely last page or bad reader).
      warnings.push(`No lots parsed on page ${page} — stopped after ${all.length} lots.`);
      stoppedReason = "empty_page";
      break;
    }

    let added = 0;
    for (const lot of lots) {
      if (seen.has(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
      added += 1;
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

  const listUrl = hibidWhiteLabelPageUrl(auctionUrl, 1, pageSize);
  return buildIngestResult({
    auctionUrl: listUrl,
    host: base.host,
    platform: "hibid",
    lots: all,
    warnings,
    pagesFetched,
    stoppedReason,
  });
}
