/**
 * Ensure market data bank tables/columns exist (Lightsail SQLite, no migrate step required).
 */

import "server-only";

import { db } from "@/lib/db";

export async function ensureMarketDataBankTables(): Promise<void> {
  await db.$client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS market_sync_runs (
      id text PRIMARY KEY NOT NULL,
      status text NOT NULL,
      started_at integer DEFAULT (unixepoch()) NOT NULL,
      finished_at integer,
      error text,
      meta text DEFAULT '{}' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS web_price_observations (
      id text PRIMARY KEY NOT NULL,
      canonical_key text NOT NULL,
      manufacturer text NOT NULL,
      model text NOT NULL,
      caliber text DEFAULT '' NOT NULL,
      variant text DEFAULT '' NOT NULL,
      upc text,
      mpn text,
      price real NOT NULL,
      listing_title text DEFAULT '' NOT NULL,
      source_url text NOT NULL,
      source_domain text NOT NULL,
      query text DEFAULT '' NOT NULL,
      provider text DEFAULT 'tavily' NOT NULL,
      source text DEFAULT 'tavily' NOT NULL,
      kind text DEFAULT 'ask' NOT NULL,
      geo text DEFAULT 'national' NOT NULL,
      observed_at integer DEFAULT (unixepoch()) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS web_price_obs_key_idx ON web_price_observations (canonical_key);
    CREATE INDEX IF NOT EXISTS web_price_obs_domain_idx ON web_price_observations (source_domain);
    CREATE INDEX IF NOT EXISTS web_price_obs_source_idx ON web_price_observations (source);
    CREATE UNIQUE INDEX IF NOT EXISTS web_price_obs_uniq
      ON web_price_observations (canonical_key, source_url, price);

    CREATE TABLE IF NOT EXISTS web_price_stats (
      canonical_key text PRIMARY KEY NOT NULL,
      manufacturer text NOT NULL,
      model text NOT NULL,
      caliber text DEFAULT '' NOT NULL,
      count integer DEFAULT 0 NOT NULL,
      domain_count integer DEFAULT 0 NOT NULL,
      low real,
      p25 real,
      median real,
      p75 real,
      high real,
      confidence text DEFAULT 'low' NOT NULL,
      sample_urls text DEFAULT '[]' NOT NULL,
      sample_domains text DEFAULT '[]' NOT NULL,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );
  `);

  // Additive columns for DBs created before market bank labeling.
  for (const col of [
    "ALTER TABLE web_price_observations ADD COLUMN source text NOT NULL DEFAULT 'tavily'",
    "ALTER TABLE web_price_observations ADD COLUMN kind text NOT NULL DEFAULT 'ask'",
    "ALTER TABLE web_price_observations ADD COLUMN geo text NOT NULL DEFAULT 'national'",
  ]) {
    try {
      await db.$client.execute(col);
    } catch {
      // column already exists
    }
  }
}
