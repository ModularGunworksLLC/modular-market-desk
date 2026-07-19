/**
 * Create TGV tables if missing (safe on Lightsail without drizzle migrate).
 */

import { db } from "@/lib/db";

/** Create TGV tables if missing (safe on Lightsail without drizzle migrate). */
export async function ensureTgvTables(): Promise<void> {
  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS tgv_models (
      id TEXT PRIMARY KEY NOT NULL,
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'handgun',
      tgv_path TEXT NOT NULL,
      gap_reason TEXT NOT NULL DEFAULT 'oa_missing',
      last_status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      synced_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await db.$client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS tgv_models_uniq ON tgv_models (manufacturer, model, category)`,
  );
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS tgv_models_path_idx ON tgv_models (tgv_path)`,
  );
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS tgv_models_status_idx ON tgv_models (last_status)`,
  );

  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS tgv_model_stats (
      id TEXT PRIMARY KEY NOT NULL,
      model_row_id TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'handgun',
      private_party_used REAL,
      private_party_new REAL,
      trade_in_used REAL,
      trade_in_new REAL,
      sold_count INTEGER NOT NULL DEFAULT 0,
      used_sold_count INTEGER,
      new_sold_count INTEGER,
      avg_12m_used REAL,
      avg_12m_new REAL,
      source TEXT NOT NULL DEFAULT 'tgv',
      tgv_path TEXT NOT NULL DEFAULT '',
      meta TEXT NOT NULL DEFAULT '{}',
      synced_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await db.$client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS tgv_model_stats_uniq ON tgv_model_stats (manufacturer, model, category)`,
  );
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS tgv_model_stats_model_idx ON tgv_model_stats (model_row_id)`,
  );

  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS tgv_sold_comps (
      id TEXT PRIMARY KEY NOT NULL,
      model_row_id TEXT NOT NULL,
      price REAL NOT NULL,
      condition TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      caliber TEXT NOT NULL DEFAULT '',
      manufacturer TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      sales_date_text TEXT NOT NULL DEFAULT '',
      sales_date_attr TEXT NOT NULL DEFAULT '',
      external_item_id TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      upc TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'tgv',
      synced_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS tgv_sold_comps_model_idx ON tgv_sold_comps (model_row_id)`,
  );
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS tgv_sold_comps_price_idx ON tgv_sold_comps (price)`,
  );
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS tgv_sold_comps_ext_idx ON tgv_sold_comps (external_item_id)`,
  );

  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS tgv_sync_runs (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL DEFAULT 'oa_gaps',
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at INTEGER,
      queued INTEGER,
      ok_count INTEGER,
      not_found_count INTEGER,
      blocked_count INTEGER,
      error_count INTEGER,
      error TEXT,
      meta TEXT NOT NULL DEFAULT '{}'
    )
  `);
}
