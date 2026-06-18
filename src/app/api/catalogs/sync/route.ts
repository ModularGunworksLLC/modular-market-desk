/**
 * POST /api/catalogs/sync
 * Pull a distributor API/feed catalog into catalog_items.
 * Body: { vendor?: "2ndamendmentwholesale" }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { syncTawCatalog, TawFeedError } from "@/lib/taw/feed";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  vendor: z.string().optional().default("2ndamendmentwholesale"),
});

export async function POST(request: Request): Promise<NextResponse> {
  let vendor = "2ndamendmentwholesale";
  try {
    const json = (await request.json()) as unknown;
    vendor = bodySchema.parse(json).vendor.trim().toLowerCase();
  } catch {
    // empty body is fine — default vendor
  }

  if (vendor !== "2ndamendmentwholesale") {
    return NextResponse.json({ error: `API sync not implemented for "${vendor}".` }, { status: 409 });
  }

  try {
    const result = await syncTawCatalog();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    let status = 500;
    if (err instanceof TawFeedError) {
      status = err.status ?? 502;
      // Missing vault token / feed URL / preset are config gaps, not upstream outages.
      if (
        message.includes("No active 2AW API token") ||
        message.includes("Missing 2AW feed URL") ||
        message.includes("No CSV preset")
      ) {
        status = 409;
      }
    }
    return NextResponse.json({ error: message }, { status });
  }
}
