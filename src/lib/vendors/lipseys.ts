/**
 * Lipsey's Integration API catalog sync.
 * Uses the dealer Token from Session Vault (kind=market_api).
 * CatalogFeed is permission-filtered — only items the account may sell.
 */

import "server-only";

import { getVendorApiConnection } from "@/lib/connections";
import { redactSecrets } from "@/lib/vault";

import { importRawCatalogRecords } from "./import-rows";
import type { VendorSyncResult } from "./types";
import { VendorSyncError } from "./types";

const VENDOR = "lipseys";
const DEFAULT_FEED = "https://api.lipseys.com/api/Integration/Items/CatalogFeed";
const TIMEOUT_MS = 180_000;

export async function syncLipseysCatalog(): Promise<VendorSyncResult> {
  const conn = await getVendorApiConnection(VENDOR, "market_api");
  if (!conn?.token) {
    throw new VendorSyncError(
      "No active Lipsey's API token in Session Vault. Save vendor=lipseys, kind=market_api (Token from Lipsey's Integration login).",
      409,
    );
  }

  const fromMeta = typeof conn.meta.feedUrl === "string" ? conn.meta.feedUrl.trim() : "";
  const feedUrl = fromMeta || DEFAULT_FEED;

  const syncStartedAt = new Date();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(feedUrl, {
      method: "GET",
      headers: {
        Token: conn.token,
        Accept: "application/json",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new VendorSyncError(`Lipsey's CatalogFeed request failed: ${redactSecrets((err as Error).message)}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new VendorSyncError(
      "Lipsey's unauthorized — re-paste the Integration API Token in Session Vault.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new VendorSyncError(
      `Lipsey's CatalogFeed HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      res.status,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new VendorSyncError("Lipsey's CatalogFeed returned non-JSON.");
  }

  const envelope = body as {
    success?: boolean;
    authorized?: boolean;
    errors?: string[];
    data?: unknown;
  };

  if (envelope.authorized === false) {
    throw new VendorSyncError("Lipsey's rejected the token (authorized=false). Re-paste Token.", 401);
  }
  if (envelope.success === false) {
    const errs = Array.isArray(envelope.errors) ? envelope.errors.join("; ") : "unknown error";
    throw new VendorSyncError(`Lipsey's CatalogFeed error: ${errs}`, 502);
  }

  const data = envelope.data;
  const items = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items ?? [])
      : null;

  if (!items) {
    throw new VendorSyncError("Lipsey's CatalogFeed payload missing data items array.");
  }
  if (items.length === 0) {
    throw new VendorSyncError("Lipsey's CatalogFeed returned 0 items — check account permissions.");
  }

  const records = items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const imported = await importRawCatalogRecords(records, {
    vendorName: VENDOR,
    sourceFile: "lipseys-catalog-feed",
    markStale: true,
    syncStartedAt,
  });

  return {
    ...imported,
    mode: "lipseys_api",
    source: feedUrl,
  };
}
