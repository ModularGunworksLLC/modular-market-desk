/**
 * Upsert RSR inventory rows into catalog_items.
 */

import { round2 } from "@/lib/arbitrage/fees";
import { upsertCatalogItems } from "@/lib/csv/importer";
import type { NewCatalogItem } from "@/lib/db/schema";

import { parseRsrInventoryText, type RsrInventoryRow } from "./parse-inventory";

const VENDOR = "rsr";

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function rsrRowsToCatalogItems(
  rows: RsrInventoryRow[],
  sourceFile = "rsrinventory-new.txt",
): NewCatalogItem[] {
  const now = new Date();
  const out: NewCatalogItem[] = [];
  for (const r of rows) {
    if (/^deleted$/i.test(r.status ?? "")) continue;
    const upc = r.upc;
    const sku = r.sku;
    const dedupeKey = upc ?? sku ?? slug(r.manufacturer, r.model, r.description);
    const qty = r.qty;
    out.push({
      vendorName: VENDOR,
      dedupeKey,
      sku,
      upc,
      manufacturer: r.manufacturer || "Unknown",
      model: r.model || r.description,
      caliber: null,
      category: r.category,
      description: r.description || null,
      dealerPrice: round2(r.dealerPrice),
      msrp: r.msrp != null ? round2(r.msrp) : null,
      mapPrice: null,
      salePrice: null,
      onSale: false,
      qty,
      inStock: qty == null ? true : qty > 0,
      sourceFile,
      importedAt: now,
      updatedAt: now,
    });
  }
  return out;
}

export async function upsertRsrInventoryText(
  text: string,
  sourceFile = "rsrinventory-new.txt",
): Promise<{ upserted: number; parsed: number; skipped: number }> {
  const rows = parseRsrInventoryText(text);
  const items = rsrRowsToCatalogItems(rows, sourceFile);
  const upserted = await upsertCatalogItems(items);
  return { upserted, parsed: rows.length, skipped: rows.length - items.length };
}
