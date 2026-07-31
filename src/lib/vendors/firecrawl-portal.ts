/**
 * Firecrawl-backed dealer portal catalog sync.
 *
 * Uses Session Vault `vendor_session` cookie strings (and optional catalogUrl /
 * feedUrl in meta) to scrape the dealer inventory experience the account is
 * authorized for. Prefer CSV export links when discovered; otherwise extract
 * structured product rows via Firecrawl JSON schema.
 */

import "server-only";

import { Readable } from "node:stream";

import { getPresetForVendor } from "@/lib/catalog-queries";
import { getVendorApiConnection } from "@/lib/connections";
import { importCatalogCsv } from "@/lib/csv/importer";
import { createFirecrawlClient, FirecrawlConfigError } from "@/lib/firecrawl/client";
import { redactSecrets } from "@/lib/vault";
import { vendorLabel } from "@/lib/tracked-vendors";

import { getVendorSyncConfig } from "./config";
import { importRawCatalogRecords, markMissingOutOfStock } from "./import-rows";
import { extractCsvUrls, extractProductRecords } from "./rows";
import type { VendorSyncConfig, VendorSyncResult } from "./types";
import { VendorSyncError } from "./types";

const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sku: { type: "string" },
          upc: { type: "string" },
          manufacturer: { type: "string" },
          model: { type: "string" },
          description: { type: "string" },
          caliber: { type: "string" },
          category: { type: "string" },
          dealerPrice: { type: "number" },
          msrp: { type: "number" },
          mapPrice: { type: "number" },
          salePrice: { type: "number" },
          qty: { type: "number" },
          onSale: { type: "boolean" },
        },
      },
    },
    csvDownloadUrls: {
      type: "array",
      items: { type: "string" },
      description: "Direct links to CSV/TSV/XLS inventory or price-list downloads",
    },
  },
  required: ["products"],
} as const;

const EXTRACT_PROMPT =
  "Extract every sellable catalog product visible for this logged-in dealer account: SKU/item number, UPC, manufacturer, model, description, caliber, category, dealer/wholesale price, MSRP, MAP, sale price, and quantity on hand. Also list any CSV, TSV, or Excel inventory/price-list download URLs. Only include products this dealer account is allowed to purchase.";

function cookieHeader(session: string): string {
  const s = session.trim();
  if (/^cookie\s*:/i.test(s)) return s.replace(/^cookie\s*:\s*/i, "");
  return s;
}

function resolveCatalogUrl(cfg: VendorSyncConfig, meta: Record<string, unknown>): string {
  const fromMeta =
    (typeof meta.catalogUrl === "string" && meta.catalogUrl.trim()) ||
    (typeof meta.feedUrl === "string" && meta.feedUrl.trim()) ||
    "";
  const url = fromMeta || cfg.defaultCatalogUrl || "";
  if (!url) {
    throw new VendorSyncError(
      `Missing catalog URL for "${cfg.vendor}". Paste catalog/export URL in Session Vault (Feed URL / catalogUrl).`,
      409,
    );
  }
  return url;
}

async function importCsvBody(
  vendor: string,
  body: string,
  sourceFile: string,
  syncStartedAt: Date,
): Promise<VendorSyncResult> {
  const preset = await getPresetForVendor(vendor);
  if (!preset) {
    throw new VendorSyncError(`No CSV preset for "${vendor}". Run Seed presets on /import.`, 409);
  }
  const imported = await importCatalogCsv(Readable.from([body]), {
    vendorName: vendor,
    columnMap: preset.columnMap,
    sourceFile,
  });
  let markedOutOfStock = 0;
  if (imported.upserted > 0) {
    markedOutOfStock = await markMissingOutOfStock(vendor, syncStartedAt);
  }
  return {
    ...imported,
    mode: "firecrawl_portal",
    markedOutOfStock,
    source: sourceFile,
  };
}

async function tryFetchCsvWithSession(
  url: string,
  cookie: string,
  vendor: string,
  syncStartedAt: Date,
): Promise<VendorSyncResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: cookie,
        Accept: "text/csv, text/plain, application/octet-stream, */*",
      },
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const body = await res.text();
    if (!body.trim() || body.trimStart().startsWith("<")) return null;
    // Heuristic: need a header row with commas/tabs
    const first = body.split(/\r?\n/)[0] ?? "";
    if (!/[,\t]/.test(first)) return null;
    return importCsvBody(vendor, body, url, syncStartedAt);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncFirecrawlPortal(vendor: string): Promise<VendorSyncResult> {
  const cfg = getVendorSyncConfig(vendor);
  if (!cfg) {
    throw new VendorSyncError(`Unknown vendor "${vendor}".`, 409);
  }

  const session = await getVendorApiConnection(vendor, "vendor_session");
  const api = await getVendorApiConnection(vendor, "market_api");
  const cookie = session?.token ? cookieHeader(session.token) : "";
  const meta = session?.meta ?? api?.meta ?? {};

  if (!cookie && !api?.token) {
    throw new VendorSyncError(
      `No Session Vault credentials for ${vendorLabel(vendor)}. Save kind=vendor_session (dealer Cookie string) or kind=market_api + Feed/catalog URL.`,
      409,
    );
  }

  // If a CSV feed URL is configured with an API token, prefer direct feed.
  const feedCandidate =
    (typeof meta.feedUrl === "string" && meta.feedUrl.trim()) ||
    (vendor === "2ndamendmentwholesale" ? (process.env.TAW_FEED_URL ?? "").trim() : "") ||
    "";
  if (api?.token && feedCandidate && /\.(csv|tsv|txt)(\?|$)/i.test(feedCandidate)) {
    const { syncVendorFeed } = await import("./feed");
    return syncVendorFeed(vendor);
  }

  let client;
  try {
    client = createFirecrawlClient();
  } catch (err) {
    if (err instanceof FirecrawlConfigError) throw new VendorSyncError(err.message, 409);
    throw err;
  }

  const catalogUrl = resolveCatalogUrl(cfg, meta);
  const syncStartedAt = new Date();
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (api?.token) {
    headers.Authorization = `Bearer ${api.token}`;
    headers.Token = api.token;
  }

  let doc: Awaited<ReturnType<typeof client.scrape>>;
  try {
    doc = await client.scrape(catalogUrl, {
      formats: [
        "markdown",
        "links",
        {
          type: "json",
          prompt: EXTRACT_PROMPT,
          schema: PRODUCT_SCHEMA,
        },
      ],
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      onlyMainContent: false,
      waitFor: 2500,
      proxy: "auto",
      timeout: 120_000,
      ...(cfg.firecrawlProfile
        ? { profile: { name: cfg.firecrawlProfile, saveChanges: true } }
        : {}),
    });
  } catch (err) {
    const msg = redactSecrets((err as Error).message);
    if (/401|403|unauthorized|login|sign in/i.test(msg)) {
      throw new VendorSyncError(
        `${vendorLabel(vendor)} portal rejected the session — re-paste vendor_session cookies.`,
        401,
      );
    }
    throw new VendorSyncError(`Firecrawl scrape failed for ${vendorLabel(vendor)}: ${msg}`, 502);
  }

  const markdown = doc.markdown ?? "";
  if (/sign in|log in|login required|access denied|unauthorized/i.test(markdown.slice(0, 2000)) && !cookie) {
    throw new VendorSyncError(
      `${vendorLabel(vendor)} page looks like a login wall. Paste dealer Cookie string as vendor_session.`,
      401,
    );
  }

  const jsonPayload = (doc as { json?: unknown }).json ?? null;
  const csvUrls = extractCsvUrls(jsonPayload);
  const linkUrls = Array.isArray(doc.links) ? doc.links.filter((u): u is string => typeof u === "string") : [];
  const csvCandidates = [
    ...csvUrls,
    ...linkUrls.filter((u) => /\.(csv|tsv|xlsx?)(\?|$)/i.test(u) || /export|download|inventory|pricelist|price-list/i.test(u)),
  ];

  if (cookie) {
    for (const url of [...new Set(csvCandidates)].slice(0, 5)) {
      const viaCsv = await tryFetchCsvWithSession(url, cookie, vendor, syncStartedAt);
      if (viaCsv && viaCsv.upserted > 0) {
        return { ...viaCsv, source: url };
      }
    }
  }

  // If the catalog URL itself is a CSV and scrape returned markdown that looks tabular, try raw fetch.
  if (cookie && /\.(csv|tsv)(\?|$)/i.test(catalogUrl)) {
    const viaCsv = await tryFetchCsvWithSession(catalogUrl, cookie, vendor, syncStartedAt);
    if (viaCsv && viaCsv.upserted > 0) return viaCsv;
  }

  const records = extractProductRecords(jsonPayload);
  if (records.length === 0) {
    // Escalate: short interact pass to open inventory / export.
    const scrapeId = doc.metadata?.scrapeId;
    if (scrapeId) {
      try {
        const interacted = await client.interact(scrapeId, {
          prompt:
            "If a login wall is present, stop. Otherwise navigate to the full dealer inventory or price list, open any CSV/Excel export if available, and summarize how many products are listed. Prefer downloading a full inventory file over paging.",
          timeout: 90,
        });
        const output = interacted.output ?? interacted.stdout ?? "";
        void output;
      } catch {
        // interact is best-effort; fall through to hard error below
      }
    }
    throw new VendorSyncError(
      `Firecrawl found no catalog products on ${catalogUrl}. Confirm the catalog/export URL in Session Vault and that the vendor_session cookie is still valid.`,
      502,
    );
  }

  const imported = await importRawCatalogRecords(records, {
    vendorName: vendor,
    sourceFile: catalogUrl,
    markStale: true,
    syncStartedAt,
  });

  if (imported.upserted === 0) {
    throw new VendorSyncError(
      `Firecrawl extracted ${records.length} rows but none had a usable dealer price. Check portal pricing columns / account permissions.`,
      502,
    );
  }

  return {
    ...imported,
    mode: "firecrawl_portal",
    source: catalogUrl,
  };
}
