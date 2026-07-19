import type { AuctionPlatform } from "@/lib/auctions/detect";

export interface AuctionLot {
  lot: string;
  title: string;
  currentBid: number | null;
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
