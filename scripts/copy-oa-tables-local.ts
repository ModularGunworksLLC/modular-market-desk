/**
 * Copy OA catalog + market tables from Lightsail snapshot into local desk.db
 * so Make/Model/Caliber dropdowns work in local dev.
 *
 *   npx tsx scripts/copy-oa-tables-local.ts
 */
import { createClient } from "@libsql/client";

async function main() {
  const srcUrl = process.env.OA_SRC ?? "file:./data/desk-lightsail-oa.db";
  const dstUrl = process.env.DATABASE_URL ?? "file:./data/desk.db";
  console.log(`> copy OA tables ${srcUrl} → ${dstUrl}`);

  const src = createClient({ url: srcUrl });
  const dst = createClient({ url: dstUrl });

  await dst.executeMultiple(`
    CREATE TABLE IF NOT EXISTS oa_catalog (
      id text PRIMARY KEY NOT NULL,
      condition text NOT NULL,
      manufacturer_id integer NOT NULL,
      manufacturer text NOT NULL,
      is_common integer DEFAULT false NOT NULL,
      model_id integer NOT NULL,
      model text NOT NULL,
      caliber_id integer NOT NULL,
      caliber text NOT NULL,
      synced_at integer DEFAULT (unixepoch()) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS oa_catalog_uniq ON oa_catalog (condition, model_id, caliber_id);
    CREATE TABLE IF NOT EXISTS oa_market_stats (
      id text PRIMARY KEY NOT NULL,
      condition text NOT NULL,
      manufacturer_id integer NOT NULL,
      manufacturer text NOT NULL,
      model_id integer NOT NULL,
      model text NOT NULL,
      caliber_id integer NOT NULL,
      caliber text NOT NULL,
      sold_count integer DEFAULT 0 NOT NULL,
      sold_low real, sold_p25 real, sold_median real, sold_p75 real, sold_high real, sold_avg real,
      asking_count integer DEFAULT 0 NOT NULL,
      asking_low real, asking_p25 real, asking_median real, asking_p75 real, asking_high real, asking_avg real,
      sold_samples text DEFAULT '[]' NOT NULL,
      asking_samples text DEFAULT '[]' NOT NULL,
      last_error text,
      synced_at integer DEFAULT (unixepoch()) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS oa_market_stats_uniq ON oa_market_stats (condition, model_id, caliber_id);
    CREATE TABLE IF NOT EXISTS oa_sold_comps (
      id text PRIMARY KEY NOT NULL,
      condition text NOT NULL,
      model_id integer NOT NULL,
      caliber_id integer NOT NULL,
      price real NOT NULL,
      sales_date text DEFAULT '' NOT NULL,
      listing_type text DEFAULT '' NOT NULL,
      title text DEFAULT '' NOT NULL,
      synced_at integer DEFAULT (unixepoch()) NOT NULL
    );
  `);

  const tables = (process.env.OA_COPY_SOLD === "1"
    ? ["oa_catalog", "oa_market_stats", "oa_sold_comps"]
    : ["oa_catalog", "oa_market_stats"]) as string[];

  for (const table of tables) {
    await dst.execute(`DELETE FROM ${table}`);
    const rows = await src.execute(`SELECT * FROM ${table}`);
    console.log(`  ${table}: ${rows.rows.length} rows`);
    const batch = 200;
    for (let i = 0; i < rows.rows.length; i += batch) {
      const slice = rows.rows.slice(i, i + batch);
      if (!slice.length) continue;
      const cols = Object.keys(slice[0]!);
      const placeholders = cols.map(() => "?").join(",");
      const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
      for (const row of slice) {
        await dst.execute({
          sql,
          args: cols.map((c) => (row as Record<string, unknown>)[c] as string | number | null),
        });
      }
    }
  }

  src.close();
  dst.close();
  console.log("> done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
