/** Shared auction lot → batch CSV helper. */

import type { AuctionLot } from "@/lib/auctions/types";

function csvCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Convert firearm lots to batch CSV. Titles are quoted so commas, quotes, and
 * embedded newlines survive parseBatchSheet (csv-parse).
 * Opening ask is its own column and is never written into Current Bid.
 */
export function lotsToBatchCsv(lots: AuctionLot[], buyerPremiumPct = 15): string {
  const header = [
    "Lot",
    "Title",
    "Current Bid",
    "Opening Ask",
    "Bid Kind",
    "Required Bid",
    "Bid Increment",
    "Buyer Premium",
  ];
  const lines = lots.map((l) =>
    [
      csvCell(l.lot),
      csvCell(l.title),
      csvCell(l.currentBid),
      csvCell(l.openingAsk),
      csvCell(l.bidKind ?? (l.currentBid != null ? "bid" : "")),
      csvCell(l.requiredBid),
      csvCell(l.bidIncrementAmount),
      csvCell(buyerPremiumPct),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
