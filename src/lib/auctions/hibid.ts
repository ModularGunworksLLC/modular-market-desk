/**
 * HiBid-style auction lot ingest (Pearce / bids.*.com).
 * Uses public HTML list pages with pagination — no browser session.
 */

import type { AuctionIngestResult, AuctionLot } from "@/lib/auctions/types";

const NON_FIREARM_RE =
  /\b(ammo|ammunition|cartridge|rounds?|box of|knife|knives|blade|bow|arrow|holster only|magazine only|scope only|optic only|binocular|spotting|tent|camping|apparel|shirt|hat|memorabilia|advertising|shipping information|auction information)\b/i;

const FIREARM_HINT_RE =
  /\b(pistol|revolver|rifle|shotgun|carbine|handgun|firearm|glock|sig|ruger|smith|wesson|colt|remington|winchester|mossberg|benelli|beretta|cz|canik|taurus|kel-?tec|springfield|fn |hk |heckler|marlin|savage|browning|dpms|ar-?15|ak-?47|1911|sks|lever|bolt-action|semi-?auto)\b/i;

export class AuctionIngestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AuctionIngestError";
  }
}

function classifyTitle(title: string): AuctionLot["kind"] {
  if (/\b(ammo|ammunition|cartridge|rounds?)\b/i.test(title)) return "ammo";
  if (/\b(knife|knives|blade)\b/i.test(title) && !FIREARM_HINT_RE.test(title)) return "knife";
  if (NON_FIREARM_RE.test(title) && !FIREARM_HINT_RE.test(title)) return "other";
  if (FIREARM_HINT_RE.test(title)) return "firearm";
  // Default lots on a gun auction with serial language → firearm
  if (/\b(SN|S\/N|Serial)\b/i.test(title)) return "firearm";
  return "other";
}

type LotBidMeta = {
  requiredBid: number | null;
  bidIncrementAmount: number | null;
  highBid: number | null;
};

/** Pull per-lot required_bid / bid_increment_amount from embedded HiBid Apollo JSON. */
function extractLotBidMetaFromHtml(html: string): Map<string, LotBidMeta> {
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

function extractLotsFromHtml(html: string, baseUrl: string): AuctionLot[] {
  const bidMeta = extractLotBidMetaFromHtml(html);
  const lots: AuctionLot[] = [];
  const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
  let block: RegExpExecArray | null;
  while ((block = cardRe.exec(html)) !== null) {
    const chunk = block[0];
    const lot = block[1];
    if (!lot) continue;
    const titleM = chunk.match(/class="title">([^<]+)/);
    if (!titleM?.[1]) continue;
    const title = titleM[1].trim().replace(/&amp;/g, "&").replace(/&#39;/g, "'");
    const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
    const bidsM = chunk.match(/<strong>Bids:<\/strong><span>(\d+)<\/span>/);
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
    const cardBid = bidM?.[1] ? parseFloat(bidM[1].replace(/,/g, "")) : null;
    lots.push({
      lot,
      title,
      currentBid: cardBid ?? meta?.highBid ?? null,
      requiredBid: meta?.requiredBid ?? null,
      bidIncrementAmount: meta?.bidIncrementAmount ?? null,
      bidCount: bidsM?.[1] ? parseInt(bidsM[1], 10) : 0,
      imageUrls: [...new Set(imageUrls)].slice(0, 6),
      kind: classifyTitle(title),
      detailUrl,
    });
  }
  return lots;
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
  // Strip hash; keep path
  u.hash = "";
  return u;
}

/**
 * Fetch paginated HiBid catalog pages and return classified lots.
 */
export async function ingestHibidAuction(
  auctionUrl: string,
  opts?: { maxPages?: number; pageSize?: number },
): Promise<AuctionIngestResult> {
  const base = normalizeAuctionUrl(auctionUrl);
  const maxPages = opts?.maxPages ?? 12;
  const pageSize = opts?.pageSize ?? 100;
  const warnings: string[] = [];
  const all: AuctionLot[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = new URL(base.toString());
    pageUrl.searchParams.set("page", String(page));
    pageUrl.searchParams.set("pageSize", String(pageSize));

    const resp = await fetch(pageUrl.toString(), {
      headers: {
        "User-Agent": "ModularMarketDesk/1.0 (FFL buy-sheet; +https://modulargunworks.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!resp.ok) {
      if (page === 1) {
        throw new AuctionIngestError(`Auction host returned HTTP ${resp.status}`, 502);
      }
      warnings.push(`Stopped pagination at page ${page} (HTTP ${resp.status}).`);
      break;
    }

    const html = await resp.text();
    const lots = extractLotsFromHtml(html, pageUrl.toString());
    if (lots.length === 0) {
      if (page === 1) {
        warnings.push(
          "No lot cards matched HiBid markup — site layout may have changed; try CSV upload on /batch.",
        );
      }
      break;
    }

    for (const lot of lots) {
      if (seen.has(lot.lot)) continue;
      if (["0", "00", "000"].includes(lot.lot)) continue;
      seen.add(lot.lot);
      all.push(lot);
    }

    // Less than a full page → done
    if (lots.length < pageSize / 2) break;
  }

  const firearmLots = all.filter((l) => l.kind === "firearm");
  const skipped = all.length - firearmLots.length;
  const hasListingIncrements = all.some(
    (l) => (l.requiredBid != null && l.requiredBid > 0) || (l.bidIncrementAmount != null && l.bidIncrementAmount > 0),
  );

  return {
    auctionUrl: base.toString(),
    host: base.host,
    lots: all,
    firearmLots,
    skipped,
    warnings,
    hasListingIncrements,
  };
}

/** Convert firearm lots to batch CSV text for /api/batch paste compatibility. */
export function lotsToBatchCsv(
  lots: AuctionLot[],
  buyerPremiumPct = 15,
): string {
  const header = "Lot,Title,Current Bid,Required Bid,Bid Increment,Buyer Premium";
  const lines = lots.map((l) => {
    const title = `"${l.title.replace(/"/g, '""')}"`;
    const bid = l.currentBid == null ? "" : String(l.currentBid);
    const required = l.requiredBid == null ? "" : String(l.requiredBid);
    const inc = l.bidIncrementAmount == null ? "" : String(l.bidIncrementAmount);
    return `${l.lot},${title},${bid},${required},${inc},${buyerPremiumPct}`;
  });
  return [header, ...lines].join("\n");
}
