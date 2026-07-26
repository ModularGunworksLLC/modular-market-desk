/**
 * Upsert scraped Davidson's listing products into catalog_items.
 */

import { round2 } from "@/lib/arbitrage/fees";
import { upsertCatalogItems } from "@/lib/csv/importer";
import type { NewCatalogItem } from "@/lib/db/schema";

import type { DavidsonsListingProduct } from "./parse-listing";

const VENDOR = "davidsons";

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Best-effort brand split from Davidson's product title. */
export function splitDavidsonsName(name: string): { manufacturer: string; model: string } {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return { manufacturer: "Unknown", model: "" };
  const parts = clean.split(" ");
  const two = parts.slice(0, 2).join(" ");
  if (
    /^(smith\s*&?\s*wesson|sig\s*sauer|springfield\s*armory|heritage\s*mfg|north\s*american|anderson\s*mfg|bear\s*creek|daniel\s*defense|rock\s*island|auto[\s-]?ordnance|kel[\s-]?tec|hi[\s-]?point|cz[\s-]?usa|federal\s*premium|hornady\s*critical|winchester\s*ammo)/i.test(
      two,
    )
  ) {
    return { manufacturer: two, model: parts.slice(2).join(" ") || clean };
  }
  return { manufacturer: parts[0] || "Unknown", model: parts.slice(1).join(" ") || clean };
}

export function davidsonsProductsToCatalogItems(
  products: DavidsonsListingProduct[],
  sourceFile = "davidsons-site-scrape",
): NewCatalogItem[] {
  const now = new Date();
  const out: NewCatalogItem[] = [];
  for (const p of products) {
    if (p.dealerPrice == null || !Number.isFinite(p.dealerPrice)) continue;
    const { manufacturer, model } = splitDavidsonsName(p.name);
    const upc = (p.upc ?? "").replace(/^#+|#+$/g, "").trim() || null;
    const sku = (p.sku ?? "").trim() || null;
    const dedupeKey = upc ?? sku ?? slug(manufacturer, model, p.name);
    out.push({
      vendorName: VENDOR,
      dedupeKey,
      sku,
      upc,
      manufacturer: manufacturer || "Unknown",
      model: model || p.name,
      caliber: p.caliber?.trim() || null,
      category: p.category || null,
      description: p.name || null,
      dealerPrice: round2(p.dealerPrice),
      msrp: p.msrp != null ? round2(p.msrp) : null,
      mapPrice: null,
      salePrice: null,
      onSale: p.msrp != null && p.msrp > p.dealerPrice,
      qty: p.qty,
      inStock: p.inStock,
      sourceFile,
      importedAt: now,
      updatedAt: now,
    });
  }
  return out;
}

export async function upsertDavidsonsProducts(
  products: DavidsonsListingProduct[],
  sourceFile = "davidsons-site-scrape",
): Promise<{ upserted: number; skipped: number; parsed: number }> {
  const items = davidsonsProductsToCatalogItems(products, sourceFile);
  const skipped = products.length - items.length;
  const upserted = await upsertCatalogItems(items);
  return { upserted, skipped, parsed: products.length };
}
