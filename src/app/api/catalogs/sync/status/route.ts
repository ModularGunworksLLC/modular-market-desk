/**
 * GET /api/catalogs/sync/status?vendor=2ndamendmentwholesale
 * Pre-flight check before pulling a distributor feed.
 */

import { NextResponse } from "next/server";

import { getPresetForVendor } from "@/lib/catalog-queries";
import { getVendorApiConnection } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const vendor = (new URL(request.url).searchParams.get("vendor") ?? "2ndamendmentwholesale").trim().toLowerCase();
  const issues: string[] = [];

  const conn = await getVendorApiConnection(vendor, "market_api");
  if (!conn?.token) {
    issues.push(
      `No API token for vendor "${vendor}". On /import → Session Vault: vendor=${vendor}, kind=market_api.`,
    );
  }

  const feedUrl =
    (typeof conn?.meta.feedUrl === "string" ? conn.meta.feedUrl.trim() : "") ||
    (process.env.TAW_FEED_URL ?? "").trim();
  if (!feedUrl) {
    issues.push("Missing feed URL. Paste it in Session Vault (Feed URL) or set TAW_FEED_URL in server .env.");
  }

  const preset = await getPresetForVendor(vendor);
  if (!preset) {
    issues.push(`No CSV preset for "${vendor}". Click Seed presets on /import.`);
  }

  return NextResponse.json({
    ok: issues.length === 0,
    vendor,
    hasToken: Boolean(conn?.token),
    hasFeedUrl: Boolean(feedUrl),
    hasPreset: Boolean(preset),
    label: conn?.label ?? null,
    issues,
  });
}
