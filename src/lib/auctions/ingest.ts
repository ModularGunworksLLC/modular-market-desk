/**
 * Multi-platform auction ingest orchestrator.
 * Routes by platform family + URL variant (not per-house hostnames).
 */

import { ingestBidWranglerAuction } from "@/lib/auctions/bidwrangler";
import {
  auctionPlatformLabel,
  detectAuctionPlatform,
  detectAuctionTarget,
  isLiveAuctioneersUrl,
  type AuctionPlatform,
  type AuctionTarget,
} from "@/lib/auctions/detect";
import { lotsToBatchCsv } from "@/lib/auctions/csv";
import { ingestHibidCatalog } from "@/lib/auctions/hibid-catalog";
import { ingestHibidAuction } from "@/lib/auctions/hibid";
import { ingestProxibid } from "@/lib/auctions/proxibid";
import { AuctionIngestError, type AuctionIngestResult } from "@/lib/auctions/types";

export type { AuctionPlatform, AuctionTarget };
export {
  auctionPlatformLabel,
  detectAuctionPlatform,
  detectAuctionTarget,
  isLiveAuctioneersUrl,
  lotsToBatchCsv,
};
export { AuctionIngestError };

export interface IngestAuctionOptions {
  maxPages?: number;
}

export function defaultIngestPages(target: AuctionTarget): number {
  if (target.platform === "bidwrangler") return 40;
  // Browse trees can be large — still page deeply; UI shows loadedLots / page cap.
  if (target.platform === "proxibid") return target.variant === "event" ? 40 : 20;
  if (target.platform === "hibid" && target.variant === "catalog") return 40;
  return 40;
}

export async function ingestAuction(
  url: string,
  opts?: IngestAuctionOptions,
): Promise<AuctionIngestResult> {
  if (isLiveAuctioneersUrl(url)) {
    throw new AuctionIngestError(
      "LiveAuctioneers catalogs are not supported yet. If the same sale is on HiBid, paste that catalog URL, or upload a CSV on /batch.",
      400,
    );
  }

  const target = detectAuctionTarget(url);

  switch (target.platform) {
    case "hibid":
      return target.variant === "catalog"
        ? ingestHibidCatalog(url, { maxPages: opts?.maxPages })
        : ingestHibidAuction(url, { maxPages: opts?.maxPages });
    case "bidwrangler":
      return ingestBidWranglerAuction(url, { maxPages: opts?.maxPages });
    case "proxibid":
      return ingestProxibid(url, { maxPages: opts?.maxPages });
    default:
      throw new AuctionIngestError(
        "Unsupported auction URL. Supported: HiBid (bids.* / Pearce / Fowler / *.hibid.com/catalog), BidWrangler (…/auctions/{id}), Proxibid event catalogs and guns category pages. Or paste a CSV on Batch.",
        400,
      );
  }
}
