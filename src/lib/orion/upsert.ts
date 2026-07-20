/**
 * Upsert scraped Orion Wholesale listing products into catalog_items.
 */

import { round2 } from "@/lib/arbitrage/fees";
import { upsertCatalogItems } from "@/lib/csv/importer";
import type { NewCatalogItem } from "@/lib/db/schema";

import type { OrionListingProduct } from "./parse-listing";

const VENDOR = "orion";

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function orionProductsToCatalogItems(
  products: OrionListingProduct[],
  sourceFile = "orion-browser-scrape",
): NewCatalogItem[] {
  const now = new Date();
  const out: NewCatalogItem[] = [];
  for (const p of products) {
    if (p.dealerPrice == null || !Number.isFinite(p.dealerPrice)) continue;
    const manufacturer = (p.manufacturer || "Unknown").trim() || "Unknown";
    const model = (p.description || "").trim() || manufacturer;
    const upc = p.upc.replace(/^#+|#+$/g, "").trim() || null;
    const sku = p.sku.trim() || null;
    const dedupeKey = upc ?? sku ?? slug(manufacturer, model, p.productId);
    out.push({
      vendorName: VENDOR,
      dedupeKey,
      sku,
      upc,
      manufacturer,
      model,
      caliber: null,
      category: p.category || null,
      description: p.description || null,
      dealerPrice: round2(p.dealerPrice),
      msrp: p.msrp != null ? round2(p.msrp) : null,
      mapPrice: null,
      salePrice: null,
      onSale: p.msrp != null && p.msrp > p.dealerPrice,
      qty: null,
      inStock: p.inStock,
      sourceFile,
      importedAt: now,
      updatedAt: now,
    });
  }
  return out;
}

export async function upsertOrionProducts(
  products: OrionListingProduct[],
): Promise<{ parsed: number; upserted: number; skipped: number }> {
  const items = orionProductsToCatalogItems(products);
  const upserted = await upsertCatalogItems(items);
  return {
    parsed: products.length,
    upserted,
    skipped: products.length - items.length,
  };
}
