/**
 * Multi-platform auction ingest orchestrator.
 */

import { ingestBidWranglerAuction } from "@/lib/auctions/bidwrangler";
import {
  auctionPlatformLabel,
  detectAuctionPlatform,
  type AuctionPlatform,
} from "@/lib/auctions/detect";
import { lotsToBatchCsv } from "@/lib/auctions/csv";
import { ingestHibidAuction } from "@/lib/auctions/hibid";
import { ingestProxibidCategory } from "@/lib/auctions/proxibid";
import { AuctionIngestError, type AuctionIngestResult } from "@/lib/auctions/types";

export type { AuctionPlatform };
export { auctionPlatformLabel, detectAuctionPlatform, lotsToBatchCsv };
export { AuctionIngestError };

export interface IngestAuctionOptions {
  maxPages?: number;
}

export async function ingestAuction(
  url: string,
  opts?: IngestAuctionOptions,
): Promise<AuctionIngestResult> {
  const platform = detectAuctionPlatform(url);

  switch (platform) {
    case "hibid":
      return ingestHibidAuction(url, { maxPages: opts?.maxPages });
    case "bidwrangler":
      return ingestBidWranglerAuction(url, { maxPages: opts?.maxPages });
    case "proxibid":
      return ingestProxibidCategory(url, { maxPages: opts?.maxPages });
    default:
      throw new AuctionIngestError(
        "Unsupported auction URL. Supported: HiBid (bids.*.com / Pearce / Fowler), BidWrangler (…bidwrangler.com/…/auctions/{id}), Proxibid guns category pages. Or paste a CSV on Batch.",
        400,
      );
  }
}
