/**
 * Create trade-in tables if missing (safe on Lightsail without drizzle migrate).
 */

import { db } from "@/lib/db";

export async function ensureTradeInTables(): Promise<void> {
  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS trade_in_requests (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      serial_number TEXT NOT NULL,
      caliber TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      notes TEXT,
      estimate_p25 REAL,
      estimate_sold_count INTEGER,
      estimate_label TEXT,
      oa_model_id INTEGER,
      oa_caliber_id INTEGER,
      notify_sent INTEGER NOT NULL DEFAULT 0,
      notify_error TEXT,
      source_ip TEXT,
      user_agent TEXT,
      handled_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS trade_in_requests_status_idx ON trade_in_requests (status, created_at)`,
  );
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS trade_in_requests_created_idx ON trade_in_requests (created_at)`,
  );

  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS trade_in_photos (
      id TEXT PRIMARY KEY NOT NULL,
      request_id TEXT NOT NULL REFERENCES trade_in_requests(id) ON DELETE CASCADE,
      stored_name TEXT NOT NULL,
      thumb_name TEXT,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await db.$client.execute(
    `CREATE INDEX IF NOT EXISTS trade_in_photos_request_idx ON trade_in_photos (request_id)`,
  );
}
