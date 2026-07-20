/**
 * Upsert scraped Zanders listing products into catalog_items (same path as CSV/API syncs).
 */

import { round2 } from "@/lib/arbitrage/fees";
import { upsertCatalogItems } from "@/lib/csv/importer";
import type { NewCatalogItem } from "@/lib/db/schema";

import type { ZandersListingProduct } from "./parse-listing";

const VENDOR = "zanders";

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Best-effort brand split from Zanders title (first token(s)). */
export function splitZandersDescription(description: string): {
  manufacturer: string;
  model: string;
} {
  const clean = description.replace(/\s+/g, " ").trim();
  if (!clean) return { manufacturer: "Unknown", model: "" };
  const parts = clean.split(" ");
  // Common two-word brands
  const two = parts.slice(0, 2).join(" ");
  if (
    /^(smith\s*&?\s*wesson|sig\s*sauer|springfield\s*armory|heritage\s*mfg|north\s*american|anderson\s*mfg|bear\s*creek|daniel\s*defense|rock\s*island|auto[\s-]?ordnance|kel[\s-]?tec|hi[\s-]?point|cz[\s-]?usa)/i.test(
      two,
    )
  ) {
    return { manufacturer: two, model: parts.slice(2).join(" ") || clean };
  }
  return { manufacturer: parts[0] || "Unknown", model: parts.slice(1).join(" ") || clean };
}

export function zandersProductsToCatalogItems(
  products: ZandersListingProduct[],
  sourceFile = "zanders-browser-scrape",
): NewCatalogItem[] {
  const now = new Date();
  const out: NewCatalogItem[] = [];
  for (const p of products) {
    if (p.dealerPrice == null || !Number.isFinite(p.dealerPrice)) continue;
    const { manufacturer, model } = splitZandersDescription(p.description);
    const upc = p.upc.replace(/^#+|#+$/g, "").trim() || null;
    const sku = p.sku.trim() || null;
    const dedupeKey = upc ?? sku ?? slug(manufacturer, model, p.description);
    out.push({
      vendorName: VENDOR,
      dedupeKey,
      sku,
      upc,
      manufacturer: manufacturer || "Unknown",
      model: model || p.description,
      caliber: null,
      category: p.category || null,
      description: p.description || null,
      dealerPrice: round2(p.dealerPrice),
      msrp: p.msrp != null ? round2(p.msrp) : null,
      mapPrice: p.mapPrice != null ? round2(p.mapPrice) : null,
      salePrice: null,
      onSale: p.msrp != null && p.msrp > p.dealerPrice,
      qty: p.qty,
      inStock: p.qty == null ? true : p.qty > 0,
      sourceFile,
      importedAt: now,
      updatedAt: now,
    });
  }
  return out;
}

export async function upsertZandersProducts(
  products: ZandersListingProduct[],
): Promise<{ parsed: number; upserted: number; skipped: number }> {
  const items = zandersProductsToCatalogItems(products);
  const upserted = await upsertCatalogItems(items);
  return {
    parsed: products.length,
    upserted,
    skipped: products.length - items.length,
  };
}
