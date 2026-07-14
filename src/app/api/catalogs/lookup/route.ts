/**
 * GET /api/catalogs/lookup?upc=
 * Prefill desk identity fields from any uploaded distributor catalog row.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { catalogItems } from "@/lib/db/schema";

export const runtime = "nodejs";

function cleanUpc(raw: string): string {
  return raw.trim().replace(/^#+|#+$/g, "");
}

function inferMpn(row: {
  sku: string | null;
  description: string | null;
}): string {
  const sku = row.sku?.trim() ?? "";
  if (/^\d{4,6}$/.test(sku)) return sku;
  const desc = row.description ?? "";
  const mfg = desc.match(/\b(?:mfg\s*mdl|model\s*#?|item\s*#)\s*#?\s*(\d{4,6})\b/i);
  if (mfg?.[1]) return mfg[1];
  return "";
}

export async function GET(request: Request): Promise<NextResponse> {
  const upc = cleanUpc(new URL(request.url).searchParams.get("upc") ?? "");
  if (!upc) {
    return NextResponse.json({ error: "upc query param required" }, { status: 400 });
  }

  const rows = await db.select().from(catalogItems).where(eq(catalogItems.upc, upc)).limit(10);
  if (!rows.length) {
    return NextResponse.json({ found: false, upc });
  }

  const row = rows.sort((a, b) => Number(a.dealerPrice) - Number(b.dealerPrice))[0]!;
  return NextResponse.json({
    found: true,
    upc,
    manufacturer: row.manufacturer,
    model: row.model,
    caliber: row.caliber ?? "",
    mpn: inferMpn(row),
    dealerPrice: row.dealerPrice,
    vendorName: row.vendorName,
    description: row.description,
  });
}
