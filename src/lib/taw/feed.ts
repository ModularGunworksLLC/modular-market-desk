/**
 * 2nd Amendment Wholesale catalog feed sync.
 * Pulls a dealer-filtered CSV (or TSV) from the feed URL stored in the Session Vault meta
 * or TAW_FEED_URL, then upserts into catalog_items via the shared CSV importer.
 */

import "server-only";

import { Readable } from "node:stream";

import { getPresetForVendor } from "@/lib/catalog-queries";
import { getVendorApiConnection } from "@/lib/connections";
import { importCatalogCsv, type ImportResult } from "@/lib/csv/importer";
import { redactSecrets } from "@/lib/vault";

const VENDOR = "2ndamendmentwholesale";
const DEFAULT_TIMEOUT_MS = 120_000;

export class TawFeedError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TawFeedError";
  }
}

function resolveFeedUrl(token: string, meta: Record<string, unknown>): string {
  const fromMeta = typeof meta.feedUrl === "string" ? meta.feedUrl.trim() : "";
  const fromEnv = (process.env.TAW_FEED_URL ?? "").trim();
  const raw = fromMeta || fromEnv;
  if (!raw) {
    throw new TawFeedError(
      "Missing 2AW feed URL. Paste it in Session Vault (Feed URL field) or set TAW_FEED_URL in .env.",
    );
  }
  return raw.replace(/\{token\}/gi, encodeURIComponent(token));
}

export async function syncTawCatalog(): Promise<ImportResult> {
  const conn = await getVendorApiConnection(VENDOR);
  if (!conn?.token) {
    throw new TawFeedError(
      "No active 2AW API token in Session Vault. Save vendor=2ndamendmentwholesale, kind=market_api.",
    );
  }

  const preset = await getPresetForVendor(VENDOR);
  if (!preset) {
    throw new TawFeedError(`No CSV preset for "${VENDOR}". Run Seed presets on /import.`);
  }

  const feedUrl = resolveFeedUrl(conn.token, conn.meta);
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
    throw new TawFeedError(`Feed request failed: ${redactSecrets((err as Error).message)}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new TawFeedError("Unauthorized — re-paste the 2AW API token or confirm feed URL.", res.status);
  }
  if (!res.ok) {
    throw new TawFeedError(`Feed HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!body.trim()) {
    throw new TawFeedError("Feed returned an empty body.");
  }

  if (contentType.includes("json") || body.trimStart().startsWith("{") || body.trimStart().startsWith("[")) {
    throw new TawFeedError(
      "Feed returned JSON. Export or request a CSV product feed from 2AW, or paste the CSV feed URL they issued.",
    );
  }

  const nodeStream = Readable.from([body]);
  return importCatalogCsv(nodeStream, {
    vendorName: VENDOR,
    columnMap: preset.columnMap,
    sourceFile: "2aw-api-feed",
  });
}
