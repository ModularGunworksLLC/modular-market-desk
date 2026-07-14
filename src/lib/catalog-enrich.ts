/**
 * Enrich evaluate identity from any uploaded distributor catalog (UPC lookup).
 */

import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { catalogItems } from "@/lib/db/schema";
import type { EvaluateRequest } from "@/lib/validation";

export interface EnrichedEvaluateIdentity {
  manufacturer: string;
  model: string;
  caliber: string;
  mpn: string;
  upc: string;
  catalogDescription: string | null;
  catalogVendor: string | null;
  notes: string[];
}

function cleanUpc(raw: string): string {
  return raw.trim().replace(/^#+|#+$/g, "");
}

/** Pull MPN-like tokens from catalog sku / model / description. */
function inferMpnFromCatalog(row: {
  sku: string | null;
  model: string;
  description: string | null;
}): string {
  const sku = row.sku?.trim() ?? "";
  if (/^\d{4,6}$/.test(sku)) return sku;
  const desc = row.description ?? "";
  const mfg = desc.match(/\b(?:mfg\s*mdl|model\s*#?|item\s*#)\s*#?\s*(\d{4,6})\b/i);
  if (mfg?.[1]) return mfg[1];
  const bare = desc.match(/\b(\d{5})\b/);
  if (bare?.[1]) return bare[1];
  return "";
}

export async function enrichEvaluateIdentity(body: EvaluateRequest): Promise<EnrichedEvaluateIdentity> {
  const notes: string[] = [];
  let manufacturer = body.manufacturer.trim();
  let model = body.model.trim();
  let caliber = body.caliber?.trim() ?? "";
  let mpn = body.mpn?.trim() ?? "";
  const upc = cleanUpc(body.upc ?? "");

  let catalogDescription: string | null = null;
  let catalogVendor: string | null = null;

  if (upc) {
    const rows = await db.select().from(catalogItems).where(eq(catalogItems.upc, upc)).limit(5);
    const row = rows.sort((a, b) => Number(a.dealerPrice) - Number(b.dealerPrice))[0];
    if (row) {
      catalogVendor = row.vendorName;
      catalogDescription = row.description;
      if (!manufacturer) manufacturer = row.manufacturer;
      if (!model) model = row.model;
      if (!caliber && row.caliber) caliber = row.caliber;
      if (!mpn) {
        const inferred = inferMpnFromCatalog(row);
        if (inferred) {
          mpn = inferred;
          notes.push(`MPN ${inferred} inferred from ${row.vendorName} catalog.`);
        }
      }
      notes.push(`Catalog hit: ${row.vendorName} @ $${Number(row.dealerPrice).toFixed(2)}.`);
    }
  }

  return {
    manufacturer,
    model,
    caliber,
    mpn,
    upc,
    catalogDescription,
    catalogVendor,
    notes,
  };
}
