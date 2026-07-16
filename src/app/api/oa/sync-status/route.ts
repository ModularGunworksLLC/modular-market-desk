/**
 * GET /api/oa/sync-status
 * Vault readiness + oa_catalog coverage + last sync report.
 */

import { NextResponse } from "next/server";

import { getOaCatalogStatus } from "@/lib/oa/sync-catalog";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const status = await getOaCatalogStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
