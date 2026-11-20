import type { AuctionPlatform } from "@/lib/auctions/detect";

export interface AuctionLot {
  lot: string;
  title: string;
  currentBid: number | null;
  /** Opening ask when nobody has bid. Not a live hammer. */
  openingAsk?: number | null;
  /** "ask" means currentBid is empty and openingAsk is the labeled ask. */
  bidKind?: "bid" | "ask";
  /** Next legal hammer when the listing exposes it. */
  requiredBid: number | null;
  /** Bid increment at the current price level when known. */
  bidIncrementAmount: number | null;
  bidCount: number;
  imageUrls: string[];
  /** Heuristic: looks like a firearm vs ammo/knife/gear */
  kind: "firearm" | "ammo" | "knife" | "other";
  detailUrl?: string;
}

export type AuctionStoppedReason =
  | "complete"
  | "no_new_lots"
  | "http_error"
  | "page_cap"
  | "empty_page";

export interface AuctionIngestResult {
  auctionUrl: string;
  host: string;
  platform: AuctionPlatform;
  lots: AuctionLot[];
  firearmLots: AuctionLot[];
  skipped: number;
  warnings: string[];
  /** True when any lot carried listing next-bid / increment fields. */
  hasListingIncrements: boolean;
  /** Total lots after dedupe (same as lots.length). */
  loadedLots: number;
  /** How many list pages were fetched. */
  pagesFetched: number;
  /** Why pagination stopped — shown in the Batch UI. */
  stoppedReason: AuctionStoppedReason;
}

export class AuctionIngestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AuctionIngestError";
  }
}
