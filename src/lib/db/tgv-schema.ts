/**
 * TGV (True Gun Value) local bank — parallel to OA, never mixed into oa_*.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

/** Canonical TGV model page (make + model + category). */
export const tgvModels = sqliteTable(
  "tgv_models",
  {
    id: id(),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    category: text("category").notNull().default("handgun"), // handgun | rifle | shotgun
    tgvPath: text("tgv_path").notNull(),
    gapReason: text("gap_reason").notNull().default("oa_missing"), // oa_missing | oa_zero_sold | manual
    lastStatus: text("last_status").notNull().default("pending"), // pending | ok | not_found | cf_blocked | error
    lastError: text("last_error"),
    syncedAt: integer("synced_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniq: uniqueIndex("tgv_models_uniq").on(t.manufacturer, t.model, t.category),
    pathIdx: index("tgv_models_path_idx").on(t.tgvPath),
    statusIdx: index("tgv_models_status_idx").on(t.lastStatus),
  }),
);

/** Rollup values from a TGV model page (Private Party / Trade In / counts). */
export const tgvModelStats = sqliteTable(
  "tgv_model_stats",
  {
    id: id(),
    modelRowId: text("model_row_id").notNull(),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    category: text("category").notNull().default("handgun"),
    privatePartyUsed: real("private_party_used"),
    privatePartyNew: real("private_party_new"),
    tradeInUsed: real("trade_in_used"),
    tradeInNew: real("trade_in_new"),
    soldCount: integer("sold_count").notNull().default(0),
    usedSoldCount: integer("used_sold_count"),
    newSoldCount: integer("new_sold_count"),
    avg12mUsed: real("avg_12m_used"),
    avg12mNew: real("avg_12m_new"),
    source: text("source").notNull().default("tgv"),
    tgvPath: text("tgv_path").notNull().default(""),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniq: uniqueIndex("tgv_model_stats_uniq").on(t.manufacturer, t.model, t.category),
    modelIdx: index("tgv_model_stats_model_idx").on(t.modelRowId),
  }),
);

/** Sample sold comps scraped from a TGV model page. */
export const tgvSoldComps = sqliteTable(
  "tgv_sold_comps",
  {
    id: id(),
    modelRowId: text("model_row_id").notNull(),
    price: real("price").notNull(),
    condition: text("condition").notNull().default(""),
    title: text("title").notNull().default(""),
    caliber: text("caliber").notNull().default(""),
    manufacturer: text("manufacturer").notNull().default(""),
    model: text("model").notNull().default(""),
    salesDateText: text("sales_date_text").notNull().default(""),
    salesDateAttr: text("sales_date_attr").notNull().default(""),
    externalItemId: text("external_item_id").notNull().default(""),
    location: text("location").notNull().default(""),
    upc: text("upc").notNull().default(""),
    sku: text("sku").notNull().default(""),
    source: text("source").notNull().default("tgv"),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    modelIdx: index("tgv_sold_comps_model_idx").on(t.modelRowId),
    priceIdx: index("tgv_sold_comps_price_idx").on(t.price),
    extIdx: index("tgv_sold_comps_ext_idx").on(t.externalItemId),
  }),
);

export const tgvSyncRuns = sqliteTable("tgv_sync_runs", {
  id: id(),
  kind: text("kind").notNull().default("oa_gaps"), // oa_gaps | single
  status: text("status").notNull(), // running | ok | error
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  queued: integer("queued"),
  okCount: integer("ok_count"),
  notFoundCount: integer("not_found_count"),
  blockedCount: integer("blocked_count"),
  errorCount: integer("error_count"),
  error: text("error"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
});

export type TgvModel = typeof tgvModels.$inferSelect;
export type TgvModelStat = typeof tgvModelStats.$inferSelect;
export type TgvSoldComp = typeof tgvSoldComps.$inferSelect;
export type TgvSyncRun = typeof tgvSyncRuns.$inferSelect;
