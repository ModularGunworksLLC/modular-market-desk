/** Wholesale cross-reference: find the same gun across the tracked distributors. */

import "server-only";

import { and, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { catalogItems } from "@/lib/db/schema";

import {
  displayProductLabel,
  filterTextMatchesByPrice,
  isDisplayFirearm,
  isUpcCatalogFirearm,
  MIN_FIREARM_DISPLAY_SCORE,
  MIN_WHOLESALE_SCORE,
  scoreWholesaleRow,
  type WholesaleQuery,
} from "./wholesale-match";

import { TRACKED_VENDORS } from "@/lib/tracked-vendors";

export { TRACKED_VENDORS };

export interface WholesaleMatch {
  vendorName: string;
  sku: string | null;
  upc: string | null;
  manufacturer: string;
  model: string;
  productLabel: string;
  dealerPrice: number;
  inStock: boolean;
  cheaperThanTarget: boolean;
  relevanceScore?: number;
  isFirearm?: boolean;
}

export interface WholesaleGrid {
  /** Complete firearms only — primary desk grid. */
  firearmMatches: WholesaleMatch[];
  /** Legacy alias = firearmMatches for older clients. */
  matches: WholesaleMatch[];
  cheapestInStockFirearm: number | null;
  /** Do not hammer above this when new guns are on the floor (dealer cost). */
  suggestedHammerCeiling: number | null;
  cheaperThanTarget: boolean;
  matchMode: "upc" | "text";
  warning: string | null;
}

export async function crossReferenceWholesale(params: {
  upc?: string;
  manufacturer: string;
  model: string;
  caliber?: string;
  category?: string;
  targetAcquisitionCost: number;
}): Promise<WholesaleGrid> {
  const upc = params.upc?.trim().replace(/^#+|#+$/g, "");
  const query: WholesaleQuery = {
    manufacturer: params.manufacturer,
    model: params.model,
    caliber: params.caliber,
    category: params.category,
  };

  const matchMode: WholesaleGrid["matchMode"] = upc ? "upc" : "text";
  const rawMatches = upc
    ? await fetchByUpc(upc, params.targetAcquisitionCost, query)
    : await fetchByText(params, query);

  let firearmMatches = rawMatches.filter((m) => m.isFirearm);
  let textMatchWarning: string | null = null;
  if (matchMode === "text" && params.targetAcquisitionCost > 0 && firearmMatches.length > 0) {
    const filtered = filterTextMatchesByPrice(firearmMatches, params.targetAcquisitionCost);
    firearmMatches = filtered.matches;
    textMatchWarning = filtered.warning;
  }
  const inStockFirearms = firearmMatches.filter((m) => m.inStock).map((m) => m.dealerPrice);
  const cheapestInStockFirearm = inStockFirearms.length ? Math.min(...inStockFirearms) : null;

  let warning: string | null = textMatchWarning;
  if (cheapestInStockFirearm != null && params.targetAcquisitionCost > cheapestInStockFirearm) {
    warning = `Your cost ($${params.targetAcquisitionCost.toFixed(2)}) exceeds in-stock new dealer floor ($${cheapestInStockFirearm.toFixed(2)}).`;
  } else if (cheapestInStockFirearm != null && !textMatchWarning) {
    warning = null;
  }

  return {
    firearmMatches,
    matches: firearmMatches,
    cheapestInStockFirearm,
    suggestedHammerCeiling: cheapestInStockFirearm,
    cheaperThanTarget:
      cheapestInStockFirearm != null && cheapestInStockFirearm < params.targetAcquisitionCost,
    matchMode,
    warning,
  };
}

async function fetchByUpc(
  upc: string,
  targetAcquisitionCost: number,
  query: WholesaleQuery,
): Promise<WholesaleMatch[]> {
  const rows = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.upc, upc))
    .orderBy(sql`${catalogItems.dealerPrice} ASC`)
    .limit(50);

  return rows
    .map((r) => toMatch(r, targetAcquisitionCost, query, true))
    .filter((m) => m.isFirearm);
}

async function fetchByText(
  params: {
    manufacturer: string;
    model: string;
    targetAcquisitionCost: number;
  },
  query: WholesaleQuery,
): Promise<WholesaleMatch[]> {
  const mfr = params.manufacturer.trim();
  const mdl = params.model.trim();
  const rows = await db
    .select()
    .from(catalogItems)
    .where(
      and(
        like(catalogItems.manufacturer, `%${mfr}%`),
        or(like(catalogItems.model, `%${mdl}%`), like(catalogItems.description, `%${mdl}%`)),
      ),
    )
    .limit(400);

  return rows
    .map((r) => {
      const catalog = {
        manufacturer: r.manufacturer,
        model: r.model,
        description: r.description,
        category: r.category,
        dealerPrice: Number(r.dealerPrice),
      };
      const relevanceScore = scoreWholesaleRow(catalog, query);
      return { r, relevanceScore, catalog };
    })
    .filter((x) => x.relevanceScore >= MIN_WHOLESALE_SCORE)
    .sort((a, b) => {
      const aGun = isDisplayFirearm(a.catalog, query) ? 1 : 0;
      const bGun = isDisplayFirearm(b.catalog, query) ? 1 : 0;
      if (bGun !== aGun) return bGun - aGun;
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      return Number(a.r.dealerPrice) - Number(b.r.dealerPrice);
    })
    .slice(0, 40)
    .map(({ r, relevanceScore, catalog }) => ({
      ...toMatch(r, params.targetAcquisitionCost, query),
      relevanceScore,
      isFirearm: isDisplayFirearm(catalog, query) && relevanceScore >= MIN_FIREARM_DISPLAY_SCORE,
    }));
}

function toMatch(
  r: typeof catalogItems.$inferSelect,
  targetAcquisitionCost: number,
  query: WholesaleQuery,
  matchedByUpc = false,
): WholesaleMatch {
  const dealerPrice = Number(r.dealerPrice);
  const catalog = {
    manufacturer: r.manufacturer,
    model: r.model,
    description: r.description,
    category: r.category,
    dealerPrice,
  };
  const score = scoreWholesaleRow(catalog, query);
  const isFirearm = matchedByUpc
    ? isUpcCatalogFirearm(catalog, query)
    : isDisplayFirearm(catalog, query) && score >= MIN_FIREARM_DISPLAY_SCORE;

  return {
    vendorName: r.vendorName,
    sku: r.sku,
    upc: r.upc,
    manufacturer: r.manufacturer,
    model: r.model,
    productLabel: displayProductLabel(catalog),
    dealerPrice,
    inStock: r.inStock,
    cheaperThanTarget: dealerPrice < targetAcquisitionCost,
    relevanceScore: score,
    isFirearm,
  };
}
