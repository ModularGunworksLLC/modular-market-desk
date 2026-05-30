/** Wholesale cross-reference: find the same gun across the tracked distributors. */

import "server-only";

import { and, eq, like, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { catalogItems } from "@/lib/db/schema";

export const TRACKED_VENDORS = ["lipseys", "zanders", "davidsons", "chattanooga"] as const;

export interface WholesaleMatch {
  vendorName: string;
  sku: string | null;
  upc: string | null;
  manufacturer: string;
  model: string;
  dealerPrice: number;
  inStock: boolean;
  cheaperThanTarget: boolean;
}

export interface WholesaleGrid {
  matches: WholesaleMatch[];
  cheapestNewPrice: number | null;
  cheaperThanTarget: boolean; // any distributor beats the user's target acquisition cost
}

/**
 * Look up by UPC first (exact, indexed), else by manufacturer+model (indexed prefix match).
 * Flags any distributor selling brand-new below `targetAcquisitionCost`.
 */
export async function crossReferenceWholesale(params: {
  upc?: string;
  manufacturer: string;
  model: string;
  targetAcquisitionCost: number;
}): Promise<WholesaleGrid> {
  const upc = params.upc?.trim();

  const rows = await db
    .select()
    .from(catalogItems)
    .where(
      upc
        ? eq(catalogItems.upc, upc)
        : and(
            // SQLite LIKE is case-insensitive for ASCII by default.
            like(catalogItems.manufacturer, `%${params.manufacturer}%`),
            like(catalogItems.model, `%${params.model}%`),
          ),
    )
    .orderBy(sql`${catalogItems.dealerPrice} ASC`)
    .limit(50);

  const matches: WholesaleMatch[] = rows.map((r) => {
    const dealerPrice = Number(r.dealerPrice);
    return {
      vendorName: r.vendorName,
      sku: r.sku,
      upc: r.upc,
      manufacturer: r.manufacturer,
      model: r.model,
      dealerPrice,
      inStock: r.inStock,
      cheaperThanTarget: dealerPrice < params.targetAcquisitionCost,
    };
  });

  const inStockPrices = matches.filter((m) => m.inStock).map((m) => m.dealerPrice);
  const cheapestNewPrice = inStockPrices.length ? Math.min(...inStockPrices) : null;

  return {
    matches,
    cheapestNewPrice,
    cheaperThanTarget: cheapestNewPrice != null && cheapestNewPrice < params.targetAcquisitionCost,
  };
}
