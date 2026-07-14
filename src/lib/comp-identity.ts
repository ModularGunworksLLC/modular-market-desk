/**
 * Vendor-neutral comp tightening: UPC, MPN, new-only asks, dealer-cost floor.
 * Pure functions — shared by OA client and evaluate pipeline.
 */

import type { AskingCompInput, SoldCompInput } from "@/lib/comp-filter";

export type CompMatchTier = "exact-upc" | "exact-mpn" | "family" | "thin";

export interface CompIdentityContext {
  upc?: string;
  mpn?: string;
  /** Catalog / ad description — used for capacity variant guards. */
  catalogDescription?: string;
  dealerCost?: number;
  /** New vendor mode: drop used asks. */
  newOnlyAsking?: boolean;
  /** Drop asks below dealerCost × ratio (wrong SKU / used junk). */
  minAskRatioOfCost?: number;
}

const MIN_EXACT_ASKING = 1;

export function normalizeUpcDigits(upc: string | undefined): string {
  return (upc ?? "").replace(/\D/g, "");
}

export function titleContainsUpc(title: string, upc: string): boolean {
  const digits = normalizeUpcDigits(upc);
  if (digits.length < 8) return false;
  const blob = title.replace(/\D/g, "");
  return blob.includes(digits);
}

/** MPN token must appear as a whole token in the title (e.g. 3523, 40149). */
export function titleContainsMpn(title: string, mpn: string): boolean {
  const token = mpn.trim();
  if (!token || token.length < 3) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(title);
}

export function isNewAskingCondition(condition: string): boolean {
  const c = condition.trim().toLowerCase();
  if (!c) return true;
  if (/\bused\b/.test(c)) return false;
  if (/\bnew\b/.test(c) || /factory\s*new/.test(c)) return true;
  return true;
}

/** Parse magazine capacity from catalog text (12+1, 10rd, etc.). */
export function extractCatalogCapacity(text: string | undefined): number | null {
  if (!text?.trim()) return null;
  const plus = text.match(/\b(\d{1,2})\s*\+\s*1\b/i);
  if (plus?.[1]) return Number.parseInt(plus[1], 10);
  const rd = text.match(/\b(\d{1,2})\s*(?:rd|round|shot)s?\b/i);
  if (rd?.[1]) return Number.parseInt(rd[1], 10);
  return null;
}

export function titleConflictsCapacity(title: string, capacity: number): boolean {
  const patterns = [
    /\b(\d{1,2})\s*\+\s*1\b/gi,
    /\b(\d{1,2})\s*(?:rd|round|shot)s?\b/gi,
  ];
  for (const pattern of patterns) {
    for (const m of title.matchAll(pattern)) {
      const cap = Number.parseInt(m[1] ?? "", 10);
      if (Number.isFinite(cap) && cap > 0 && cap !== capacity) return true;
    }
  }
  return false;
}

function rowPassesIdentity(
  title: string,
  ctx: CompIdentityContext,
  capacity: number | null,
): boolean {
  if (capacity != null && titleConflictsCapacity(title, capacity)) return false;
  return true;
}

export function filterSoldByIdentity(
  rows: SoldCompInput[],
  ctx: CompIdentityContext,
): { rows: SoldCompInput[]; removed: number; tier: CompMatchTier } {
  const upc = normalizeUpcDigits(ctx.upc);
  const mpn = ctx.mpn?.trim() ?? "";
  const capacity = extractCatalogCapacity(ctx.catalogDescription);

  if (!upc && !mpn) {
    return { rows, removed: 0, tier: "family" };
  }

  let tier: CompMatchTier = "family";
  let pool = rows.filter((r) => rowPassesIdentity(r.title ?? "", ctx, capacity));

  if (upc.length >= 8) {
    const upcHits = pool.filter((r) => titleContainsUpc(r.title ?? "", upc));
    if (upcHits.length >= MIN_EXACT_ASKING) {
      return { rows: upcHits, removed: rows.length - upcHits.length, tier: "exact-upc" };
    }
    if (upcHits.length > 0) {
      tier = "thin";
      pool = upcHits;
    }
  }

  if (mpn.length >= 3) {
    const mpnHits = pool.filter((r) => titleContainsMpn(r.title ?? "", mpn));
    if (mpnHits.length >= MIN_EXACT_ASKING) {
      return { rows: mpnHits, removed: rows.length - mpnHits.length, tier: "exact-mpn" };
    }
    if (mpnHits.length > 0) {
      return {
        rows: mpnHits,
        removed: rows.length - mpnHits.length,
        tier: tier === "thin" ? "thin" : "exact-mpn",
      };
    }
  }

  return { rows: pool, removed: rows.length - pool.length, tier: pool.length > 0 ? tier : "family" };
}

export function filterAskingByIdentity(
  rows: AskingCompInput[],
  ctx: CompIdentityContext,
): { rows: AskingCompInput[]; removed: number; tier: CompMatchTier } {
  let pool = [...rows];
  let removed = 0;

  if (ctx.newOnlyAsking) {
    const next = pool.filter((r) => isNewAskingCondition(r.condition));
    removed += pool.length - next.length;
    pool = next;
  }

  const ratio = ctx.minAskRatioOfCost;
  if (ratio != null && ratio > 0 && (ctx.dealerCost ?? 0) > 0) {
    const floor = ctx.dealerCost! * ratio;
    const next = pool.filter((r) => r.price >= floor);
    removed += pool.length - next.length;
    pool = next;
  }

  const capacity = extractCatalogCapacity(ctx.catalogDescription);
  const variantFiltered = pool.filter((r) => rowPassesIdentity(r.title, ctx, capacity));
  removed += pool.length - variantFiltered.length;
  pool = variantFiltered;

  const upc = normalizeUpcDigits(ctx.upc);
  const mpn = ctx.mpn?.trim() ?? "";

  if (!upc && !mpn) {
    return { rows: pool, removed, tier: "family" };
  }

  if (upc.length >= 8) {
    const upcHits = pool.filter((r) => titleContainsUpc(r.title, upc));
    if (upcHits.length >= MIN_EXACT_ASKING) {
      return { rows: upcHits, removed: removed + (pool.length - upcHits.length), tier: "exact-upc" };
    }
    if (upcHits.length > 0) {
      return { rows: upcHits, removed: removed + (pool.length - upcHits.length), tier: "thin" };
    }
  }

  if (mpn.length >= 3) {
    const mpnHits = pool.filter((r) => titleContainsMpn(r.title, mpn));
    if (mpnHits.length >= MIN_EXACT_ASKING) {
      return { rows: mpnHits, removed: removed + (pool.length - mpnHits.length), tier: "exact-mpn" };
    }
    if (mpnHits.length > 0) {
      return { rows: mpnHits, removed: removed + (pool.length - mpnHits.length), tier: "thin" };
    }
  }

  return { rows: pool, removed, tier: "family" };
}

export function matchTierLabel(tier: CompMatchTier): string {
  switch (tier) {
    case "exact-upc":
      return "Exact UPC match";
    case "exact-mpn":
      return "Exact MPN match";
    case "thin":
      return "Thin exact match — verify comps";
    default:
      return "Family match — verify SKU";
  }
}
