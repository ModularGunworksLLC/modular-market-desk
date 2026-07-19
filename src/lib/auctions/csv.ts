/** Shared auction lot → batch CSV helper. */

import type { AuctionLot } from "@/lib/auctions/types";

/** Convert firearm lots to batch CSV text for /api/batch paste compatibility. */
export function lotsToBatchCsv(lots: AuctionLot[], buyerPremiumPct = 15): string {
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
