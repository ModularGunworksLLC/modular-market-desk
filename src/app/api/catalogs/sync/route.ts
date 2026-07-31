/**
 * POST /api/catalogs/sync
 * Pull a distributor catalog into catalog_items via API feed, Lipsey's
 * Integration API, or Firecrawl portal scrape.
 * Body: { vendor?: TrackedVendor | "all" }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { SYNCABLE_VENDORS } from "@/lib/vendors/config";
import { syncAllVendorCatalogs, syncVendorCatalog, VendorSyncError } from "@/lib/vendors/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  vendor: z.string().optional().default("all"),
});

export async function POST(request: Request): Promise<NextResponse> {
  let vendor = "all";
  try {
    const json = (await request.json()) as unknown;
    vendor = bodySchema.parse(json).vendor.trim().toLowerCase();
  } catch {
    // empty body → sync all configured vendors
  }

  if (vendor === "all") {
    try {
      const result = await syncAllVendorCatalogs();
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  if (!(SYNCABLE_VENDORS as readonly string[]).includes(vendor)) {
    return NextResponse.json({ error: `API sync not implemented for "${vendor}".` }, { status: 409 });
  }

  try {
    const result = await syncVendorCatalog(vendor);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    let status = 500;
    if (err instanceof VendorSyncError) {
      status = err.status ?? 502;
    }
    return NextResponse.json({ error: message }, { status });
  }
}
