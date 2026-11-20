/**
 * Pick unique in-stock firearms from catalog rows for the wholesale buy scanner.
 * Same UPC (or manufacturer+model) keeps the cheapest dealer — that is the buy.
 */

import { inferCategoryFromText } from "@/lib/wholesale-scan-infer";
import { isLikelyFirearm, minFirearmPriceFloor } from "@/lib/wholesale-match";

export interface ScanCatalogRow {
  vendorName: string;
  sku: string | null;
  upc: string | null;
  manufacturer: string;
  model: string;
  description: string | null;
  category: string | null;
  caliber: string | null;
  dealerPrice: number;
  inStock: boolean;
}

export interface ScanCandidate<T extends ScanCatalogRow = ScanCatalogRow> {
  r: T;
  category: string;
}

export function scanIdentityKey(row: Pick<ScanCatalogRow, "upc" | "manufacturer" | "model">): string {
  const upc = (row.upc ?? "").replace(/\D/g, "");
  if (upc.length >= 8) return `upc:${upc}`;
  return `mm:${row.manufacturer.trim().toLowerCase()}|${row.model.trim().toLowerCase()}`;
}

function asFirearmCandidate<T extends ScanCatalogRow>(r: T): ScanCandidate<T> | null {
  const dealerPrice = Number(r.dealerPrice);
  const catalog = {
    manufacturer: r.manufacturer,
    model: r.model,
    description: r.description,
    category: r.category,
    dealerPrice,
  };
  const category = inferCategoryFromText(r.category, r.description, r.model);
  const floor = minFirearmPriceFloor(category);
  if (!(dealerPrice > 0) || dealerPrice < floor) return null;
  if (!isLikelyFirearm(catalog, { manufacturer: r.manufacturer, model: r.model, category })) {
    return null;
  }
  return { r, category };
}

/** Firearms only; cheapest in-stock source per identity; prefer UPC then cheaper. */
export function pickScanCandidates<T extends ScanCatalogRow>(rows: T[], limit: number): ScanCandidate<T>[] {
  const cheapest = new Map<string, ScanCandidate<T>>();

  for (const row of rows) {
    const cand = asFirearmCandidate(row);
    if (!cand) continue;
    const key = scanIdentityKey(cand.r);
    const prev = cheapest.get(key);
    if (!prev || Number(cand.r.dealerPrice) < Number(prev.r.dealerPrice)) {
      cheapest.set(key, cand);
    }
  }

  return [...cheapest.values()]
    .sort((a, b) => {
      const aUpc = (a.r.upc ?? "").replace(/\D/g, "").length >= 8 ? 0 : 1;
      const bUpc = (b.r.upc ?? "").replace(/\D/g, "").length >= 8 ? 0 : 1;
      if (aUpc !== bUpc) return aUpc - bUpc;
      return Number(a.r.dealerPrice) - Number(b.r.dealerPrice);
    })
    .slice(0, Math.max(0, limit));
}
