/**
 * GET /api/catalogs/sync/status?vendor=2ndamendmentwholesale|chattanooga
 * Pre-flight check before pulling a distributor feed.
 */

import { NextResponse } from "next/server";

import { resolveChattanoogaCredentials } from "@/lib/chattanooga/sync";
import { getPresetForVendor } from "@/lib/catalog-queries";
import { getVendorApiConnection } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const vendor = (new URL(request.url).searchParams.get("vendor") ?? "2ndamendmentwholesale")
    .trim()
    .toLowerCase();
  const issues: string[] = [];

  if (vendor === "chattanooga") {
    const creds = await resolveChattanoogaCredentials();
    if (!creds) {
      issues.push(
        "Missing Chattanooga API SID/token. Vault: vendor=chattanooga, kind=market_api, paste API_TOKEN as secret and API_SID in the SID field — or set CHATTANOOGA_API_SID + CHATTANOOGA_API_TOKEN in .env.",
      );
    }
    return NextResponse.json({
      ok: issues.length === 0,
      vendor,
      hasToken: Boolean(creds?.token),
      hasSid: Boolean(creds?.sid),
      hasFeedUrl: true,
      hasPreset: true,
      credentialSource: creds?.source ?? null,
      label: "Chattanooga Shooting Supplies",
      issues,
    });
  }

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
