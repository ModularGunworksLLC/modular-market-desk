/**
 * Generic CSV/TSV feed sync (2AW and any vendor with a vault feedUrl).
 */

import "server-only";

import { Readable } from "node:stream";

import { getPresetForVendor } from "@/lib/catalog-queries";
import { getVendorApiConnection } from "@/lib/connections";
import { importCatalogCsv } from "@/lib/csv/importer";
import { redactSecrets } from "@/lib/vault";

import { getVendorSyncConfig } from "./config";
import { markMissingOutOfStock } from "./import-rows";
import type { VendorSyncResult } from "./types";
import { VendorSyncError } from "./types";

const DEFAULT_TIMEOUT_MS = 120_000;

function resolveFeedUrl(
  token: string,
  meta: Record<string, unknown>,
  vendor: string,
): string {
  const fromMeta = typeof meta.feedUrl === "string" ? meta.feedUrl.trim() : "";
  const fromEnv =
    vendor === "2ndamendmentwholesale" ? (process.env.TAW_FEED_URL ?? "").trim() : "";
  const cfg = getVendorSyncConfig(vendor);
  const raw = fromMeta || fromEnv || cfg?.defaultFeedUrl || "";
  if (!raw) {
    throw new VendorSyncError(
      `Missing feed URL for "${vendor}". Paste Feed URL in Session Vault or set TAW_FEED_URL for 2AW.`,
      409,
    );
  }
  return raw.replace(/\{token\}/gi, encodeURIComponent(token));
}

export async function syncVendorFeed(vendor: string): Promise<VendorSyncResult> {
  const conn = await getVendorApiConnection(vendor, "market_api");
  if (!conn?.token) {
    throw new VendorSyncError(
      `No active API token for "${vendor}". Save vendor=${vendor}, kind=market_api in Session Vault.`,
      409,
    );
  }

  const preset = await getPresetForVendor(vendor);
  if (!preset) {
    throw new VendorSyncError(`No CSV preset for "${vendor}". Run Seed presets on /import.`, 409);
  }

  const feedUrl = resolveFeedUrl(conn.token, conn.meta, vendor);
  const syncStartedAt = new Date();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(feedUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${conn.token}`,
        Accept: "text/csv, text/plain, application/json, */*",
        "X-API-Key": conn.token,
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new VendorSyncError(`Feed request failed: ${redactSecrets((err as Error).message)}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new VendorSyncError(`Unauthorized — re-paste the ${vendor} API token or confirm feed URL.`, res.status);
  }
  if (!res.ok) {
    throw new VendorSyncError(`Feed HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!body.trim()) {
    throw new VendorSyncError("Feed returned an empty body.");
  }

  if (contentType.includes("json") || body.trimStart().startsWith("{") || body.trimStart().startsWith("[")) {
    throw new VendorSyncError(
      "Feed returned JSON. Use a CSV product feed URL, or Lipsey's API sync / Firecrawl portal sync.",
    );
  }

  const nodeStream = Readable.from([body]);
  const imported = await importCatalogCsv(nodeStream, {
    vendorName: vendor,
    columnMap: preset.columnMap,
    sourceFile: `${vendor}-api-feed`,
  });

  let markedOutOfStock = 0;
  if (imported.upserted > 0) {
    markedOutOfStock = await markMissingOutOfStock(vendor, syncStartedAt);
  }

  return {
    ...imported,
    mode: "feed",
    markedOutOfStock,
    source: feedUrl,
  };
}
