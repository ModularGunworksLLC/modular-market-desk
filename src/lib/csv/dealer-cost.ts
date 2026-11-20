/** Blank dealer price stays blank. MAP and MSRP are never substituted as cost. */

function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function resolveDealerCost(cells: {
  dealerPrice?: string | null;
  mapPrice?: string | null;
  msrp?: string | null;
}): number | null {
  // mapPrice and msrp are accepted so callers can pass the whole row and
  // tests can prove they are ignored.
  void cells.mapPrice;
  void cells.msrp;
  return parseMoney(cells.dealerPrice);
}
