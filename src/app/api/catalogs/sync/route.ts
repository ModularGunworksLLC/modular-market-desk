/**
 * POST /api/catalogs/sync
 * Pull a distributor API/feed catalog into catalog_items.
 * Body: { vendor?: "2ndamendmentwholesale" | "chattanooga" }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { syncChattanoogaCatalog, ChattanoogaApiError } from "@/lib/chattanooga/sync";
import { syncTawCatalog, TawFeedError } from "@/lib/taw/feed";
import { API_SYNC_VENDORS } from "@/lib/tracked-vendors";
import { errorMessage } from "@/lib/api-error";

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

  if (!(API_SYNC_VENDORS as readonly string[]).includes(vendor)) {
    return NextResponse.json(
      { error: `API sync not implemented for "${vendor}". Supported: ${API_SYNC_VENDORS.join(", ")}.` },
      { status: 409 },
    );
  }

  try {
    const result = vendor === "chattanooga" ? await syncChattanoogaCatalog() : await syncTawCatalog();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = errorMessage(err);
    let status = 500;
    if (err instanceof TawFeedError || err instanceof ChattanoogaApiError) {
      status = err.status ?? 502;
      if (
        message.includes("No active 2AW API token") ||
        message.includes("Missing 2AW feed URL") ||
        message.includes("No CSV preset") ||
        message.includes("Missing Chattanooga API credentials")
      ) {
        status = 409;
      }
    }
    return NextResponse.json({ error: message }, { status });
  }
}
