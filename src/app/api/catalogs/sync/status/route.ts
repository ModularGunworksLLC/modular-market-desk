/**
 * GET /api/catalogs/sync/status?vendor=lipseys
 * Pre-flight check before pulling a distributor catalog.
 * vendor=all returns status for every tracked vendor.
 */

import { NextResponse } from "next/server";

import { SYNCABLE_VENDORS } from "@/lib/vendors/config";
import { getVendorSyncStatus } from "@/lib/vendors/sync";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const vendor = (new URL(request.url).searchParams.get("vendor") ?? "all").trim().toLowerCase();

  if (vendor === "all") {
    const statuses = await Promise.all(SYNCABLE_VENDORS.map((v) => getVendorSyncStatus(v)));
    return NextResponse.json({
      ok: statuses.every((s) => s.ok),
      vendors: statuses,
    });
  }

  const status = await getVendorSyncStatus(vendor);
  return NextResponse.json(status);
}
