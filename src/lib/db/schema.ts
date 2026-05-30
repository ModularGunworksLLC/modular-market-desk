/**
 * Drizzle schema - Modular Market Desk (Neon Postgres).
 *
 * Four tables:
 *   - connections   : Session Vault for pasted bearer tokens / cookie strings (encrypted).
 *   - csv_presets   : data-driven header maps so the importer is vendor-agnostic.
 *   - catalog_items : imported distributor catalogs, indexed for fast UPC/model cross-reference.
 *   - valuations    : persisted deal evaluations (query + market metrics + profit verdict).
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const connectionKindEnum = pgEnum("connection_kind", [
  "market_api", // GunBroker Analytics bearer token
  "vendor_session", // pasted cookie/session string for a distributor site
]);

export const verdictEnum = pgEnum("verdict", ["GO", "NO-GO"]);

export const sellRouteEnum = pgEnum("sell_route", ["gunbroker", "local_al"]);

/* ----------------------------------------------------------- connections */
/* Session Vault. `secret` holds AES-256-GCM ciphertext - never plaintext. */

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: connectionKindEnum("kind").notNull(),
    vendor: text("vendor").notNull(), // e.g. "outdoor_analytics", "lipseys"
    label: text("label").notNull(),
    secret: text("secret").notNull(), // encrypted token / cookie string
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
    status: text("status").notNull().default("active"), // active | error | revoked
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const csvPresets = pgTable(
  "csv_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorName: text("vendor_name").notNull(),
    label: text("label").notNull(),
    delimiter: text("delimiter").notNull().default(","),
    encoding: text("encoding").notNull().default("utf-8"),
    columnMap: jsonb("column_map").$type<CsvColumnMap>().notNull(),
    categoryRules: jsonb("category_rules").$type<Record<string, string[]>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const catalogItems = pgTable(
  "catalog_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorName: text("vendor_name").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    sku: text("sku"),
    upc: text("upc"),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    caliber: text("caliber"),
    category: text("category"),
    description: text("description"),
    dealerPrice: numeric("dealer_price", { precision: 12, scale: 2 }).notNull(),
    msrp: numeric("msrp", { precision: 12, scale: 2 }),
    mapPrice: numeric("map_price", { precision: 12, scale: 2 }),
    salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
    onSale: boolean("on_sale").notNull().default(false),
    qty: integer("qty"),
    inStock: boolean("in_stock").notNull().default(true),
    currency: text("currency").notNull().default("USD"),
    sourceFile: text("source_file"),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const valuations = pgTable(
  "valuations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

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
    targetAcquisitionCost: numeric("target_acquisition_cost", { precision: 12, scale: 2 }).notNull(),
    inboundShip: numeric("inbound_ship", { precision: 12, scale: 2 }).notNull().default("0"),
    buyerPremiumPct: numeric("buyer_premium_pct", { precision: 6, scale: 3 }).notNull().default("0"),
    outboundShip: numeric("outbound_ship", { precision: 12, scale: 2 }).notNull().default("0"),
    listingUpgrades: numeric("listing_upgrades", { precision: 12, scale: 2 }).notNull().default("0"),
    targetProfit: numeric("target_profit", { precision: 12, scale: 2 }).notNull(),
    minMarginPct: numeric("min_margin_pct", { precision: 6, scale: 3 }).notNull(),
    allInCost: numeric("all_in_cost", { precision: 12, scale: 2 }).notNull(),

    // --- market metrics ---
    soldStats: jsonb("sold_stats").$type<PriceStats>(),
    askingStats: jsonb("asking_stats").$type<PriceStats>(),

    // --- outputs ---
    verdict: verdictEnum("verdict").notNull(),
    bestRoute: sellRouteEnum("best_route"),
    maxBid: numeric("max_bid", { precision: 12, scale: 2 }),
    netProfit: numeric("net_profit", { precision: 12, scale: 2 }),
    marginPct: numeric("margin_pct", { precision: 8, scale: 3 }),

    // --- structured payloads for the UI ---
    routeA: jsonb("route_a").$type<RouteBreakdown>(),
    routeB: jsonb("route_b").$type<RouteBreakdown>(),
    wholesaleGrid: jsonb("wholesale_grid").$type<unknown>(),
    sourceStatus: jsonb("source_status").$type<Record<string, string>>().default({}).notNull(),
    raw: jsonb("raw").$type<unknown>(),
  },
  (t) => ({
    canonicalIdx: index("valuations_canonical_idx").on(t.canonicalKey),
    upcIdx: index("valuations_upc_idx").on(t.upc),
    createdIdx: index("valuations_created_idx").on(sql`${t.createdAt} DESC`),
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
