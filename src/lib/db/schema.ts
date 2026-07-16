/**
 * Drizzle schema - Modular Market Desk (local SQLite via @libsql/client).
 *
 * Tables:
 *   - connections   : Session Vault for pasted bearer tokens / cookie strings (encrypted).
 *   - csv_presets   : data-driven header maps so the importer is vendor-agnostic.
 *   - catalog_items : imported distributor catalogs, indexed for fast UPC/model cross-reference.
 *   - valuations    : persisted deal evaluations (query + market metrics + profit verdict).
 *   - oa_catalog    : Outdoor Analytics brand/model/caliber tree (synced from /pricing/dependencies).
 *   - oa_sync_runs  : metadata for OA catalog (and later comps) sync jobs.
 *
 * SQLite type conventions used here:
 *   - ids        : text PK seeded with crypto.randomUUID()
 *   - money      : real (double) - aggregations (min/avg) work natively
 *   - booleans   : integer { mode: "boolean" } (0 / 1)
 *   - timestamps : integer { mode: "timestamp" } (unix seconds), default unixepoch()
 *   - json blobs : text { mode: "json" } - drizzle (de)serializes objects transparently
 *   - enums      : text { enum: [...] } - SQLite has no native enum type
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ enums */
/* SQLite has no enum type; these are the allowed text values for each column. */

export const CONNECTION_KINDS = ["market_api", "vendor_session"] as const;
export const VERDICTS = ["GO", "NO-GO"] as const;
export const SELL_ROUTES = ["gunbroker", "local_al"] as const;

export type ConnectionKind = (typeof CONNECTION_KINDS)[number];
export type VerdictValue = (typeof VERDICTS)[number];
export type SellRouteValue = (typeof SELL_ROUTES)[number];

/** Shared helpers so every table seeds ids/timestamps identically. */
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/* ----------------------------------------------------------- connections */
/* Session Vault. `secret` holds AES-256-GCM ciphertext - never plaintext. */

export const connections = sqliteTable(
  "connections",
  {
    id: id(),
    kind: text("kind", { enum: CONNECTION_KINDS }).notNull(),
    vendor: text("vendor").notNull(), // e.g. "outdoor_analytics", "lipseys"
    label: text("label").notNull(),
    secret: text("secret").notNull(), // encrypted token / cookie string
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"), // active | error | revoked
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    vendorKindUx: uniqueIndex("connections_vendor_kind_ux").on(t.vendor, t.kind),
  }),
);

/* ----------------------------------------------------------- csv_presets */
/* Maps a vendor's raw CSV headers onto our unified catalog columns. */

export type CsvColumnMap = {
  // unified column -> ordered list of acceptable header aliases (case/space-insensitive)
  sku?: string[];
  upc?: string[];
  manufacturer?: string[];
  model?: string[];
  description?: string[];
  caliber?: string[];
  category?: string[];
  dealerPrice?: string[];
  msrp?: string[];
  mapPrice?: string[];
  qty?: string[];
  onSale?: string[];
  salePrice?: string[];
};

export const csvPresets = sqliteTable(
  "csv_presets",
  {
    id: id(),
    vendorName: text("vendor_name").notNull(),
    label: text("label").notNull(),
    delimiter: text("delimiter").notNull().default(","),
    encoding: text("encoding").notNull().default("utf-8"),
    columnMap: text("column_map", { mode: "json" }).$type<CsvColumnMap>().notNull(),
    categoryRules: text("category_rules", { mode: "json" })
      .$type<Record<string, string[]>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    vendorUx: uniqueIndex("csv_presets_vendor_ux").on(t.vendorName),
  }),
);

/* --------------------------------------------------------- catalog_items */
/*
 * Optimized for fast cross-reference. UPSERT target is (vendor_name, dedupe_key);
 * dedupe_key = upc ?? sku ?? slug(manufacturer|model|description), set by the importer.
 */

export const catalogItems = sqliteTable(
  "catalog_items",
  {
    id: id(),
    vendorName: text("vendor_name").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    sku: text("sku"),
    upc: text("upc"),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    caliber: text("caliber"),
    category: text("category"),
    description: text("description"),
    dealerPrice: real("dealer_price").notNull(),
    msrp: real("msrp"),
    mapPrice: real("map_price"),
    salePrice: real("sale_price"),
    onSale: integer("on_sale", { mode: "boolean" }).notNull().default(false),
    qty: integer("qty"),
    inStock: integer("in_stock", { mode: "boolean" }).notNull().default(true),
    currency: text("currency").notNull().default("USD"),
    sourceFile: text("source_file"),
    importedAt: integer("imported_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // UPSERT key + the primary cross-reference lookups.
    vendorDedupeUx: uniqueIndex("catalog_items_vendor_dedupe_ux").on(t.vendorName, t.dedupeKey),
    upcIdx: index("catalog_items_upc_idx").on(t.upc),
    modelIdx: index("catalog_items_mfr_model_idx").on(t.manufacturer, t.model),
    skuIdx: index("catalog_items_vendor_sku_idx").on(t.vendorName, t.sku),
  }),
);

/* ------------------------------------------------------------ valuations */
/* One row per evaluated deal: the query, the market metrics, and the verdict. */

export type PriceStats = {
  count: number;
  low: number;
  p25: number;
  median: number;
  p75: number;
  high: number;
  avg: number;
};

export type RouteBreakdown = {
  route: "gunbroker" | "local_al";
  sellPrice: number;
  finalValueFee: number;
  masterFflFee: number;
  outboundShip: number;
  cardFee: number;
  listingUpgrades: number;
  taxAbsorbed: number;
  net: number;
};

/** Sidekick identify snapshots (photos / auction title → FirearmIdentity). */
export const identifies = sqliteTable(
  "identifies",
  {
    id: id(),
    createdAt: createdAt(),
    source: text("source").notNull().default("counter"), // counter | auction
    lot: text("lot"),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    variant: text("variant"),
    caliber: text("caliber"),
    category: text("category"),
    condition: text("condition"),
    serial: text("serial"),
    confidence: integer("confidence"),
    modelUsed: text("model_used"),
    stolenStatus: text("stolen_status"),
    hintText: text("hint_text"),
    raw: text("raw", { mode: "json" }).$type<unknown>(),
  },
  (t) => ({
    createdIdx: index("identifies_created_idx").on(sql`${t.createdAt} DESC`),
    serialIdx: index("identifies_serial_idx").on(t.serial),
  }),
);

export const valuations = sqliteTable(
  "valuations",
  {
    id: id(),
    createdAt: createdAt(),

    // --- query / identity ---
    canonicalKey: text("canonical_key").notNull(),
    category: text("category"),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    variant: text("variant"),
    upc: text("upc"),
    mpn: text("mpn"),
    caliber: text("caliber"),
    condition: text("condition").notNull().default("any"),

    // --- buy-side inputs ---
    targetAcquisitionCost: real("target_acquisition_cost").notNull(),
    inboundShip: real("inbound_ship").notNull().default(0),
    buyerPremiumPct: real("buyer_premium_pct").notNull().default(0),
    outboundShip: real("outbound_ship").notNull().default(0),
    listingUpgrades: real("listing_upgrades").notNull().default(0),
    targetProfit: real("target_profit").notNull(),
    minMarginPct: real("min_margin_pct").notNull(),
    allInCost: real("all_in_cost").notNull(),

    // --- market metrics ---
    soldStats: text("sold_stats", { mode: "json" }).$type<PriceStats>(),
    askingStats: text("asking_stats", { mode: "json" }).$type<PriceStats>(),

    // --- outputs ---
    verdict: text("verdict", { enum: VERDICTS }).notNull(),
    bestRoute: text("best_route", { enum: SELL_ROUTES }),
    maxBid: real("max_bid"),
    netProfit: real("net_profit"),
    marginPct: real("margin_pct"),

    // --- structured payloads for the UI ---
    routeA: text("route_a", { mode: "json" }).$type<RouteBreakdown>(),
    routeB: text("route_b", { mode: "json" }).$type<RouteBreakdown>(),
    wholesaleGrid: text("wholesale_grid", { mode: "json" }).$type<unknown>(),
    sourceStatus: text("source_status", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    raw: text("raw", { mode: "json" }).$type<unknown>(),
  },
  (t) => ({
    canonicalIdx: index("valuations_canonical_idx").on(t.canonicalKey),
    upcIdx: index("valuations_upc_idx").on(t.upc),
    createdIdx: index("valuations_created_idx").on(sql`${t.createdAt} DESC`),
  }),
);

/* ----------------------------------------------------------- oa_catalog */
/*
 * Flattened Outdoor Analytics /pricing/dependencies tree.
 * One row per (condition bucket × manufacturer × model × caliber).
 * Synced by scripts/sync-oa-catalog.ts — Desk will resolve against this
 * instead of calling OA live for catalog matching.
 */

export const oaCatalog = sqliteTable(
  "oa_catalog",
  {
    id: id(),
    /** OA condition bucket: NEW | USED */
    condition: text("condition").notNull(),
    manufacturerId: integer("manufacturer_id").notNull(),
    manufacturer: text("manufacturer").notNull(),
    isCommon: integer("is_common", { mode: "boolean" }).notNull().default(false),
    modelId: integer("model_id").notNull(),
    model: text("model").notNull(),
    caliberId: integer("caliber_id").notNull(),
    caliber: text("caliber").notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniq: uniqueIndex("oa_catalog_uniq").on(t.condition, t.modelId, t.caliberId),
    mfrIdx: index("oa_catalog_mfr_idx").on(t.manufacturer),
    modelIdx: index("oa_catalog_model_idx").on(t.manufacturer, t.model),
    idsIdx: index("oa_catalog_ids_idx").on(t.modelId, t.caliberId),
  }),
);

export const oaSyncRuns = sqliteTable("oa_sync_runs", {
  id: id(),
  kind: text("kind").notNull().default("catalog"), // catalog | comps | full
  status: text("status").notNull(), // running | ok | error
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  manufacturerCount: integer("manufacturer_count"),
  modelCount: integer("model_count"),
  rowCount: integer("row_count"),
  error: text("error"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
});

/**
 * Sold + asking market snapshot per OA catalog leaf.
 * Refreshed by full/comps sync from /pricing/data + /pricing/active-listings.
 */
export const oaMarketStats = sqliteTable(
  "oa_market_stats",
  {
    id: id(),
    condition: text("condition").notNull(), // NEW | USED
    manufacturerId: integer("manufacturer_id").notNull(),
    manufacturer: text("manufacturer").notNull(),
    modelId: integer("model_id").notNull(),
    model: text("model").notNull(),
    caliberId: integer("caliber_id").notNull(),
    caliber: text("caliber").notNull(),
    soldCount: integer("sold_count").notNull().default(0),
    soldLow: real("sold_low"),
    soldP25: real("sold_p25"),
    soldMedian: real("sold_median"),
    soldP75: real("sold_p75"),
    soldHigh: real("sold_high"),
    soldAvg: real("sold_avg"),
    askingCount: integer("asking_count").notNull().default(0),
    askingLow: real("asking_low"),
    askingP25: real("asking_p25"),
    askingMedian: real("asking_median"),
    askingP75: real("asking_p75"),
    askingHigh: real("asking_high"),
    askingAvg: real("asking_avg"),
    /** Compact samples for verify UI (not every historical row forever). */
    soldSamples: text("sold_samples", { mode: "json" })
      .$type<Array<{ price: number; salesDate: string; listingType: string; title?: string }>>()
      .notNull()
      .default([]),
    askingSamples: text("asking_samples", { mode: "json" })
      .$type<Array<{ price: number; title: string; condition: string; itemId: string | null }>>()
      .notNull()
      .default([]),
    lastError: text("last_error"),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniq: uniqueIndex("oa_market_stats_uniq").on(t.condition, t.modelId, t.caliberId),
    mfrIdx: index("oa_market_stats_mfr_idx").on(t.manufacturer),
    soldIdx: index("oa_market_stats_sold_idx").on(t.soldCount),
  }),
);

/** Every sold row returned by OA for a catalog leaf (replaced each comps sync for that leaf). */
export const oaSoldComps = sqliteTable(
  "oa_sold_comps",
  {
    id: id(),
    condition: text("condition").notNull(),
    modelId: integer("model_id").notNull(),
    caliberId: integer("caliber_id").notNull(),
    price: real("price").notNull(),
    salesDate: text("sales_date").notNull().default(""),
    listingType: text("listing_type").notNull().default(""),
    title: text("title").notNull().default(""),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    leafIdx: index("oa_sold_comps_leaf_idx").on(t.condition, t.modelId, t.caliberId),
    priceIdx: index("oa_sold_comps_price_idx").on(t.price),
  }),
);

/* --------------------------------------------------------- inferred types */

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type CsvPreset = typeof csvPresets.$inferSelect;
export type NewCsvPreset = typeof csvPresets.$inferInsert;
export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;
export type Valuation = typeof valuations.$inferSelect;
export type NewValuation = typeof valuations.$inferInsert;
export type IdentifySnapshot = typeof identifies.$inferSelect;
export type NewIdentifySnapshot = typeof identifies.$inferInsert;
export type OaCatalogRow = typeof oaCatalog.$inferSelect;
export type NewOaCatalogRow = typeof oaCatalog.$inferInsert;
export type OaSyncRun = typeof oaSyncRuns.$inferSelect;
export type OaMarketStat = typeof oaMarketStats.$inferSelect;
export type OaSoldComp = typeof oaSoldComps.$inferSelect;
