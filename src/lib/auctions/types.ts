export interface AuctionLot {
  lot: string;
  title: string;
  currentBid: number | null;
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
}
