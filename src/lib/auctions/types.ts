export interface AuctionLot {
  lot: string;
  title: string;
  currentBid: number | null;
  /** HiBid required next hammer when present on the listing. */
  requiredBid: number | null;
  /** HiBid bid_increment_amount at current price level. */
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
  lots: AuctionLot[];
  firearmLots: AuctionLot[];
  skipped: number;
  warnings: string[];
  /** True when any lot carried listing next-bid / increment fields. */
  hasListingIncrements: boolean;
}
