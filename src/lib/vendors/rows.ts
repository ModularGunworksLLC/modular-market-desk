/**
 * Pure helpers: normalize scraped / API product payloads into CatalogRow.
 * No I/O — unit-testable.
 */

import type { CatalogRow } from "./types";

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseQty(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  const cleaned = String(value).replace(/[^0-9-]/g, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return /^(y|yes|true|1|sale|on sale)$/i.test(value.trim());
  }
  return false;
}

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Accept snake_case / camelCase / loose portal field names. */
export function normalizeCatalogRow(raw: Record<string, unknown>): CatalogRow | null {
  const description =
    asString(raw.description) ??
    asString(raw.description1) ??
    asString(raw.productName) ??
    asString(raw.name) ??
    asString(raw.title) ??
    asString(raw.itemDescription);

  const manufacturer =
    asString(raw.manufacturer) ??
    asString(raw.mfg) ??
    asString(raw.brand) ??
    asString(raw.MFG) ??
    description?.split(/\s+/)[0] ??
    "Unknown";

  const model =
    asString(raw.model) ??
    asString(raw.mfgModelNumber) ??
    asString(raw.manufacturerModelNo) ??
    asString(raw.modelNumber) ??
    description;

  const dealerPrice =
    parseMoney(raw.dealerPrice) ??
    parseMoney(raw.currentPrice) ??
    parseMoney(raw.price) ??
    parseMoney(raw.cost) ??
    parseMoney(raw.salePrice) ??
    parseMoney(raw.mapPrice) ??
    parseMoney(raw.msrp);

  if (dealerPrice == null) return null;
  if (!model && !description) return null;

  let upc = asString(raw.upc) ?? asString(raw.upcCode) ?? asString(raw.UPC);
  if (upc) upc = upc.replace(/^#+|#+$/g, "").trim() || null;

  const sku =
    asString(raw.sku) ??
    asString(raw.itemNumber) ??
    asString(raw.itemNo) ??
    asString(raw.item) ??
    asString(raw.ITEM) ??
    null;

  const salePrice = parseMoney(raw.salePrice) ?? parseMoney(raw.specialPrice);
  const msrp = parseMoney(raw.msrp) ?? parseMoney(raw.retail);
  const mapPrice = parseMoney(raw.mapPrice) ?? parseMoney(raw.retailMap) ?? parseMoney(raw.map);
  const onSale =
    parseBool(raw.onSale) ||
    (salePrice != null && salePrice > 0 && salePrice < dealerPrice) ||
    (msrp != null && msrp > dealerPrice && salePrice != null);

  const effectiveDealer =
    salePrice != null && salePrice > 0 && salePrice < dealerPrice ? salePrice : dealerPrice;

  return {
    sku,
    upc,
    manufacturer: manufacturer || "Unknown",
    model: model || description || "Unknown",
    description: description ?? null,
    caliber: asString(raw.caliber) ?? asString(raw.caliberGauge) ?? asString(raw.gauge),
    category: asString(raw.category) ?? asString(raw.type) ?? asString(raw.itemType),
    dealerPrice: money(effectiveDealer),
    msrp: msrp != null ? money(msrp) : null,
    mapPrice: mapPrice != null ? money(mapPrice) : null,
    salePrice: salePrice != null ? money(salePrice) : null,
    onSale,
    qty: parseQty(raw.qty) ?? parseQty(raw.quantity) ?? parseQty(raw.QTY),
  };
}

export function dedupeKeyForRow(row: CatalogRow): string {
  return row.upc ?? row.sku ?? slug(row.manufacturer, row.model, row.description);
}

/** Extract product arrays from Firecrawl JSON / agent payloads of varying shapes. */
export function extractProductRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  }
  if (typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["products", "items", "data", "catalog", "rows", "results"]) {
    const v = obj[key];
    if (Array.isArray(v)) {
      return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      if (Array.isArray(nested.items)) {
        return nested.items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
      }
    }
  }
  return [];
}

function looksLikeExportUrl(url: string): boolean {
  return /\.(csv|tsv|xlsx?)(\?|$)/i.test(url) || /export|download|inventory|pricelist|price-list|feed/i.test(url);
}

function pushHttpUrl(out: string[], value: unknown, requireExportHint: boolean): void {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    if (!requireExportHint || looksLikeExportUrl(value)) out.push(value);
    return;
  }
  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      if (!requireExportHint || looksLikeExportUrl(url)) out.push(url);
    }
  }
}

export function extractCsvUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const out: string[] = [];
  // Explicit export fields — trust the extractor.
  for (const key of ["csvDownloadUrls", "downloadUrls", "csvUrls", "exportUrls"]) {
    const c = obj[key];
    if (!Array.isArray(c)) continue;
    for (const item of c) pushHttpUrl(out, item, false);
  }
  // Generic links — only keep URLs that look like inventory exports.
  if (Array.isArray(obj.links)) {
    for (const item of obj.links) pushHttpUrl(out, item, true);
  }
  return [...new Set(out)];
}
