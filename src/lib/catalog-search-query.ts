/**
 * Server-only catalog search against `catalog_items`.
 * Does not apply Evaluate firearm filters — parts remain visible.
 */

import "server-only";

import { and, eq, like, or, sql, type SQL } from "drizzle-orm";

import {
  groupCatalogOffers,
  type CatalogOfferInput,
  type CatalogProductGroup,
  type CatalogSearchParams,
  parseCatalogSearchParams,
} from "@/lib/catalog-search";
import { db } from "@/lib/db";
import { catalogItems } from "@/lib/db/schema";

export type { CatalogSearchParams };
export { parseCatalogSearchParams };

export type CatalogSearchResult = {
  q: string;
  groups: CatalogProductGroup[];
  rowCount: number;
  groupCount: number;
  categories: string[];
  vendors: string[];
};

function escapeLike(s: string): string {
  return s.replace(/[%_]/g, "");
}

function fieldMatch(pat: string): SQL {
  return or(
    like(catalogItems.upc, pat),
    like(catalogItems.sku, pat),
    like(catalogItems.manufacturer, pat),
    like(catalogItems.model, pat),
    like(catalogItems.description, pat),
    like(catalogItems.category, pat),
  )!;
}

export async function searchCatalogItems(params: CatalogSearchParams): Promise<CatalogSearchResult> {
  const q = (params.q ?? "").trim();
  const vendor = (params.vendor ?? "").trim().toLowerCase();
  const category = (params.category ?? "").trim();
  const inStockOnly = Boolean(params.inStockOnly);
  const groupLimit = Math.min(Math.max(params.limit ?? 40, 1), 100);
  const rowLimit = Math.min(Math.max(params.rowLimit ?? 400, 50), 1500);

  const clauses: SQL[] = [];

  if (vendor) {
    clauses.push(eq(catalogItems.vendorName, vendor));
  }
  if (category) {
    clauses.push(eq(catalogItems.category, category));
  }
  if (inStockOnly) {
    clauses.push(eq(catalogItems.inStock, true));
  }

  if (q) {
    const digits = q.replace(/\D/g, "");
    const tokens = q
      .split(/\s+/)
      .map((t) => escapeLike(t.trim()))
      .filter((t) => t.length >= 2)
      .slice(0, 6);

    const qClauses: SQL[] = [];

    if (digits.length >= 8) {
      qClauses.push(eq(catalogItems.upc, digits));
      qClauses.push(like(catalogItems.upc, `%${escapeLike(digits)}%`));
      qClauses.push(like(catalogItems.sku, `%${escapeLike(digits)}%`));
    }

    if (tokens.length > 0) {
      const perToken = tokens.map((tok) => fieldMatch(`%${tok}%`));
      const andTokens = perToken.length === 1 ? perToken[0]! : and(...perToken)!;
      qClauses.push(andTokens);
    } else if (digits.length < 8) {
      const frag = escapeLike(q);
      if (frag) qClauses.push(fieldMatch(`%${frag}%`));
    }

    if (qClauses.length === 1) {
      clauses.push(qClauses[0]!);
    } else if (qClauses.length > 1) {
      clauses.push(or(...qClauses)!);
    }
  }

  const where = clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  // Empty search with no filters: still allow browsing in-stock via facets hydration —
  // return no groups until user searches or picks a parts facet / category.
  const hasQueryOrFilter = Boolean(q || vendor || category || inStockOnly);

  const rows = hasQueryOrFilter
    ? await db
        .select({
          id: catalogItems.id,
          vendorName: catalogItems.vendorName,
          sku: catalogItems.sku,
          upc: catalogItems.upc,
          manufacturer: catalogItems.manufacturer,
          model: catalogItems.model,
          caliber: catalogItems.caliber,
          category: catalogItems.category,
          description: catalogItems.description,
          dealerPrice: catalogItems.dealerPrice,
          salePrice: catalogItems.salePrice,
          onSale: catalogItems.onSale,
          qty: catalogItems.qty,
          inStock: catalogItems.inStock,
        })
        .from(catalogItems)
        .where(where)
        .orderBy(sql`${catalogItems.dealerPrice} ASC`)
        .limit(rowLimit)
    : [];

  const inputs: CatalogOfferInput[] = rows.map((r) => ({
    id: String(r.id),
    vendorName: r.vendorName,
    sku: r.sku,
    upc: r.upc,
    manufacturer: r.manufacturer,
    model: r.model,
    caliber: r.caliber,
    category: r.category,
    description: r.description,
    dealerPrice: Number(r.dealerPrice),
    salePrice: r.salePrice != null ? Number(r.salePrice) : null,
    onSale: Boolean(r.onSale),
    qty: r.qty,
    inStock: Boolean(r.inStock),
  }));

  const groups = groupCatalogOffers(inputs, { groupLimit });

  const [catRows, vendorRows] = await Promise.all([
    db
      .selectDistinct({ category: catalogItems.category })
      .from(catalogItems)
      .where(sql`${catalogItems.category} IS NOT NULL AND trim(${catalogItems.category}) != ''`)
      .limit(200),
    db.selectDistinct({ vendorName: catalogItems.vendorName }).from(catalogItems).orderBy(catalogItems.vendorName),
  ]);

  const categories = catRows
    .map((r) => r.category)
    .filter((c): c is string => Boolean(c && c.trim()))
    .sort((a, b) => a.localeCompare(b));

  const vendors = vendorRows.map((r) => r.vendorName).filter(Boolean);

  return {
    q,
    groups,
    rowCount: rows.length,
    groupCount: groups.length,
    categories,
    vendors,
  };
}
