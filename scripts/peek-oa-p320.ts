import { createClient } from "@libsql/client";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });

async function main() {
  const catalog = await c.execute(
    `SELECT condition, manufacturer, model, caliber, model_id, caliber_id, count(*) as n
     FROM oa_catalog
     WHERE manufacturer LIKE '%SIG%' AND model LIKE '%P320%'
     GROUP BY condition, manufacturer, model, caliber, model_id, caliber_id
     ORDER BY condition, model, caliber
     LIMIT 80`,
  );
  console.log("=== oa_catalog P320 leaves ===");
  console.log("rows", catalog.rows.length);
  for (const r of catalog.rows) console.log(r);

  const cal = await c.execute(
    `SELECT DISTINCT caliber FROM oa_catalog
     WHERE manufacturer LIKE '%SIG%' AND model LIKE '%P320%'
     ORDER BY caliber LIMIT 40`,
  );
  console.log("=== distinct calibers ===", cal.rows);

  const stats = await c.execute(
    `SELECT condition, manufacturer, model, caliber, sold_count, sold_median, sold_p25, datetime(synced_at,'unixepoch') as synced
     FROM oa_market_stats
     WHERE manufacturer LIKE '%SIG%' AND (model LIKE '%P320%' OR model LIKE '%P 320%')
     ORDER BY sold_count DESC LIMIT 20`,
  );
  console.log("=== oa_market_stats ===");
  for (const r of stats.rows) console.log(r);

  const sync = await c.execute(
    `SELECT kind, status, datetime(started_at,'unixepoch') as started, datetime(finished_at,'unixepoch') as finished,
            manufacturer_count, model_count, row_count, error
     FROM oa_sync_runs ORDER BY started_at DESC LIMIT 8`,
  );
  console.log("=== recent oa_sync_runs ===");
  for (const r of sync.rows) console.log(r);

  const totals = await c.execute(`SELECT count(*) as n FROM oa_catalog`);
  const mstats = await c.execute(`SELECT count(*) as n FROM oa_market_stats`);
  const solds = await c.execute(`SELECT count(*) as n FROM oa_sold_comps`);
  console.log("=== table counts ===", {
    oa_catalog: totals.rows[0],
    oa_market_stats: mstats.rows[0],
    oa_sold_comps: solds.rows[0],
  });
}

main()
  .then(() => c.close())
  .catch((e) => {
    console.error(e);
    c.close();
    process.exit(1);
  });
