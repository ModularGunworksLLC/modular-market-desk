/**
 * Multi-vendor catalog sync orchestrator.
 * Chooses Lipsey's API, CSV feed, or Firecrawl portal based on vendor config
 * and available Session Vault credentials.
 */

import "server-only";

import { vendorLabel } from "@/lib/tracked-vendors";

import { getVendorSyncConfig, SYNCABLE_VENDORS } from "./config";
import { syncVendorFeed } from "./feed";
import { syncFirecrawlPortal } from "./firecrawl-portal";
import { syncLipseysCatalog } from "./lipseys";
import type { VendorSyncResult } from "./types";
import { VendorSyncError } from "./types";
import { getVendorApiConnection } from "@/lib/connections";

export { VendorSyncError, type VendorSyncResult };

async function hasSession(vendor: string): Promise<boolean> {
  const s = await getVendorApiConnection(vendor, "vendor_session");
  return Boolean(s?.token);
}

async function hasApi(vendor: string): Promise<boolean> {
  const s = await getVendorApiConnection(vendor, "market_api");
  return Boolean(s?.token);
}

/**
 * Sync one tracked vendor's authorized catalog into catalog_items.
 * Falls back Firecrawl portal ↔ Lipsey's API / feed when credentials allow.
 */
export async function syncVendorCatalog(vendorRaw: string): Promise<VendorSyncResult> {
  const vendor = vendorRaw.trim().toLowerCase();
  const cfg = getVendorSyncConfig(vendor);
  if (!cfg) {
    throw new VendorSyncError(`API sync not implemented for "${vendorRaw}".`, 409);
  }

  if (cfg.mode === "lipseys_api") {
    if (await hasApi(vendor)) {
      try {
        return await syncLipseysCatalog();
      } catch (err) {
        // Fall back to Firecrawl portal when API token fails but cookies exist.
        if (await hasSession(vendor)) {
          return syncFirecrawlPortal(vendor);
        }
        throw err;
      }
    }
    if (await hasSession(vendor)) {
      return syncFirecrawlPortal(vendor);
    }
    throw new VendorSyncError(
      "No Lipsey's credentials. Save market_api Token (preferred) or vendor_session cookies in Session Vault.",
      409,
    );
  }

  if (cfg.mode === "feed") {
    if (await hasApi(vendor)) {
      try {
        return await syncVendorFeed(vendor);
      } catch (err) {
        if (await hasSession(vendor)) {
          return syncFirecrawlPortal(vendor);
        }
        throw err;
      }
    }
    if (await hasSession(vendor)) {
      return syncFirecrawlPortal(vendor);
    }
    throw new VendorSyncError(
      `No ${vendorLabel(vendor)} credentials. Save market_api + Feed URL, or vendor_session cookies.`,
      409,
    );
  }

  // firecrawl_portal (Zanders / Davidson's / Chattanooga)
  if (await hasApi(vendor)) {
    const api = await getVendorApiConnection(vendor, "market_api");
    const feedUrl = typeof api?.meta.feedUrl === "string" ? api.meta.feedUrl.trim() : "";
    if (feedUrl) {
      try {
        return await syncVendorFeed(vendor);
      } catch {
        // fall through to Firecrawl
      }
    }
  }
  return syncFirecrawlPortal(vendor);
}

export interface SyncAllResult {
  ok: boolean;
  results: Array<{ vendor: string; ok: boolean; result?: VendorSyncResult; error?: string }>;
}

/** Sync every tracked vendor that has vault credentials; report per-vendor status. */
export async function syncAllVendorCatalogs(): Promise<SyncAllResult> {
  const results: SyncAllResult["results"] = [];
  for (const vendor of SYNCABLE_VENDORS) {
    const ready = (await hasApi(vendor)) || (await hasSession(vendor));
    if (!ready) {
      results.push({
        vendor,
        ok: false,
        error: `Skipped — no Session Vault credentials for ${vendorLabel(vendor)}.`,
      });
      continue;
    }
    try {
      const result = await syncVendorCatalog(vendor);
      results.push({ vendor, ok: true, result });
    } catch (err) {
      results.push({ vendor, ok: false, error: (err as Error).message });
    }
  }
  return {
    ok: results.some((r) => r.ok),
    results,
  };
}

export async function getVendorSyncStatus(vendorRaw: string): Promise<{
  ok: boolean;
  vendor: string;
  mode: string | null;
  hasApiToken: boolean;
  hasSession: boolean;
  hasFeedOrCatalogUrl: boolean;
  hasPreset: boolean;
  hasFirecrawlKey: boolean;
  label: string | null;
  issues: string[];
}> {
  const vendor = vendorRaw.trim().toLowerCase();
  const cfg = getVendorSyncConfig(vendor);
  const issues: string[] = [];
  const api = await getVendorApiConnection(vendor, "market_api");
  const session = await getVendorApiConnection(vendor, "vendor_session");

  const hasApiToken = Boolean(api?.token);
  const hasSessionCookie = Boolean(session?.token);
  const meta = session?.meta ?? api?.meta ?? {};
  const feedOrCatalog =
    (typeof meta.feedUrl === "string" && meta.feedUrl.trim()) ||
    (typeof meta.catalogUrl === "string" && meta.catalogUrl.trim()) ||
    (vendor === "2ndamendmentwholesale" ? (process.env.TAW_FEED_URL ?? "").trim() : "") ||
    cfg?.defaultFeedUrl ||
    cfg?.defaultCatalogUrl ||
    "";

  if (!cfg) {
    issues.push(`Unknown vendor "${vendor}".`);
  }
  if (!hasApiToken && !hasSessionCookie) {
    issues.push(
      `No credentials for "${vendor}". Save market_api and/or vendor_session in Session Vault.`,
    );
  }

  const { getPresetForVendor } = await import("@/lib/catalog-queries");
  const preset = await getPresetForVendor(vendor);
  if (!preset) {
    issues.push(`No CSV preset for "${vendor}". Click Seed presets on /import.`);
  }

  const hasFirecrawlKey = Boolean((process.env.FIRECRAWL_API_KEY ?? "").trim());
  const needsFirecrawl =
    cfg?.mode === "firecrawl_portal" || (!hasApiToken && hasSessionCookie) || (cfg?.mode === "lipseys_api" && !hasApiToken);
  if (needsFirecrawl && !hasFirecrawlKey) {
    issues.push("Missing FIRECRAWL_API_KEY in server .env (required for portal sync).");
  }

  if (cfg?.mode === "feed" && hasApiToken && !feedOrCatalog) {
    issues.push("Missing feed URL. Paste Feed URL in Session Vault or set TAW_FEED_URL.");
  }

  return {
    ok: issues.length === 0,
    vendor,
    mode: cfg?.mode ?? null,
    hasApiToken,
    hasSession: hasSessionCookie,
    hasFeedOrCatalogUrl: Boolean(feedOrCatalog),
    hasPreset: Boolean(preset),
    hasFirecrawlKey,
    label: session?.label ?? api?.label ?? null,
    issues,
  };
}
