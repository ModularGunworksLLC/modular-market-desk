/**
 * Auction bid-increment schedule helpers.
 * Listing-sourced next bid (HiBid required_bid) wins over Settings defaults.
 */

export type BidIncrementBand = {
  /** Apply this increment while current bid is strictly below `upTo`. */
  upTo: number;
  increment: number;
};

/** Sensible FFL-auction default when the listing does not supply a schedule / next bid. */
export const DEFAULT_BID_INCREMENTS: BidIncrementBand[] = [
  { upTo: 100, increment: 5 },
  { upTo: 300, increment: 10 },
  { upTo: 500, increment: 25 },
  { upTo: 1000, increment: 50 },
  { upTo: 1_000_000, increment: 100 },
];

export function normalizeBidIncrements(raw: unknown): BidIncrementBand[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_BID_INCREMENTS.map((b) => ({ ...b }));
  const out: BidIncrementBand[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const upTo = Number((row as BidIncrementBand).upTo);
    const increment = Number((row as BidIncrementBand).increment);
    if (!Number.isFinite(upTo) || upTo <= 0) continue;
    if (!Number.isFinite(increment) || increment <= 0) continue;
    out.push({ upTo, increment });
  }
  out.sort((a, b) => a.upTo - b.upTo);
  return out.length ? out : DEFAULT_BID_INCREMENTS.map((b) => ({ ...b }));
}

export function incrementForPrice(currentBid: number, schedule: BidIncrementBand[]): number {
  const bands = normalizeBidIncrements(schedule);
  const price = Math.max(0, currentBid);
  for (const band of bands) {
    if (price < band.upTo) return band.increment;
  }
  return bands[bands.length - 1]?.increment ?? 25;
}

export type ListingBidHints = {
  /** HiBid `required_bid` — exact next legal hammer when present. */
  requiredBid?: number | null;
  /** HiBid `bid_increment_amount` at the current price level. */
  incrementAmount?: number | null;
};

/**
 * Next hammer the operator must place to stay in the bidding.
 * Prefer listing required_bid, then listing increment, then Settings schedule.
 */
export function computeNextBid(
  currentBid: number | null | undefined,
  schedule: BidIncrementBand[],
  listing?: ListingBidHints | null,
): number | null {
  if (currentBid == null || !Number.isFinite(currentBid) || currentBid < 0) return null;

  const required = listing?.requiredBid;
  if (required != null && Number.isFinite(required) && required > currentBid + 0.001) {
    return Math.round(required * 100) / 100;
  }

  const listingInc = listing?.incrementAmount;
  if (listingInc != null && Number.isFinite(listingInc) && listingInc > 0) {
    return Math.round((currentBid + listingInc) * 100) / 100;
  }

  const inc = incrementForPrice(currentBid, schedule);
  return Math.round((currentBid + inc) * 100) / 100;
}

/** Largest legal step at or below maxBid (using listing increment or schedule at that price). */
export function walkAwayLegalBid(
  maxBid: number | null | undefined,
  schedule: BidIncrementBand[],
  listing?: ListingBidHints | null,
): number | null {
  if (maxBid == null || !Number.isFinite(maxBid) || maxBid <= 0) return null;
  const listingInc = listing?.incrementAmount;
  const inc =
    listingInc != null && Number.isFinite(listingInc) && listingInc > 0
      ? listingInc
      : incrementForPrice(maxBid, schedule);
  if (inc <= 0) return Math.round(maxBid * 100) / 100;
  const stepped = Math.floor(maxBid / inc + 1e-9) * inc;
  return Math.round(Math.max(0, stepped) * 100) / 100;
}

export function describeIncrementSource(source: "listing" | "settings" | "mixed"): string {
  if (source === "listing") return "Increments: from auction listing";
  if (source === "mixed") return "Increments: listing when present, else Settings";
  return "Increments: Settings default";
}
