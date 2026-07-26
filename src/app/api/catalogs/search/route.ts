/**
 * GET /api/catalogs/search?q=&vendor=&category=&inStockOnly=1&limit=
 * Master catalog search across distributors — includes parts (no firearm filter).
 */

import { NextResponse } from "next/server";

import { PARTS_KEYWORD_FACETS, parseCatalogSearchParams } from "@/lib/catalog-search";
import { searchCatalogItems } from "@/lib/catalog-search-query";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const parsed = parseCatalogSearchParams(new URL(request.url));

  try {
    const result = await searchCatalogItems(parsed);
    return NextResponse.json({
      ok: true,
      ...result,
      partsFacets: PARTS_KEYWORD_FACETS,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || "Catalog search failed" },
      { status: 500 },
    );
  }
}
