import { createClient } from "@libsql/client";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });

async function one(sql: string) {
  const r = await c.execute(sql);
  return r.rows[0] ?? {};
}

const catalogLeaves = await one(
  "select count(*) as n from oa_catalog where caliber_id > 0",
);
const marketStatsRows = await one("select count(*) as n from oa_market_stats");
const withSold = await one("select count(*) as n from oa_market_stats where sold_count > 0");
const syncedLast6d = await one(
  "select count(*) as n from oa_market_stats where synced_at > datetime('now', '-6 days')",
);
const syncedRange = await one(
  "select min(synced_at) as mn, max(synced_at) as mx from oa_market_stats",
);
const runs = await c.execute(
  "select id, kind, status, started_at, finished_at, row_count from oa_sync_runs order by started_at desc limit 5",
);

console.log(
  JSON.stringify(
    {
      catalogLeaves,
      marketStatsRows,
      withSold,
      syncedLast6d,
      syncedRange,
      recentRuns: runs.rows,
    },
    null,
    2,
  ),
);

await c.close();
