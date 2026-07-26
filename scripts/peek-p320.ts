import { createClient } from "@libsql/client";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });

async function main() {
  const stats = await c.execute(
    `SELECT * FROM web_price_stats
     WHERE manufacturer LIKE '%sig%' AND (model LIKE '%p320%' OR canonical_key LIKE '%p320%')
     ORDER BY updated_at DESC LIMIT 10`,
  );
  console.log("=== web_price_stats ===");
  for (const r of stats.rows) {
    console.log(JSON.stringify(r, null, 2));
  }

  const obs = await c.execute(
    `SELECT price, listing_title, source_domain, source_url, query, datetime(observed_at,'unixepoch') as observed
     FROM web_price_observations
     WHERE canonical_key LIKE '%p320%' OR (manufacturer LIKE '%sig%' AND model LIKE '%p320%')
     ORDER BY observed_at DESC LIMIT 40`,
  );
  console.log("=== web_price_observations (latest) ===");
  for (const r of obs.rows) {
    console.log(
      `${r.price}\t${r.source_domain}\t${String(r.listing_title).slice(0, 70)}\t${r.observed}`,
    );
  }

  const vals = await c.execute(
    `SELECT datetime(created_at,'unixepoch') as ts, manufacturer, model, caliber,
            target_acquisition_cost, max_bid, net_profit, verdict, sold_stats, asking_stats, source_status
     FROM valuations
     WHERE manufacturer LIKE '%sig%' AND model LIKE '%p320%'
     ORDER BY created_at DESC LIMIT 5`,
  );
  console.log("=== valuations ===");
  for (const r of vals.rows) {
    const sold = typeof r.sold_stats === "string" ? JSON.parse(r.sold_stats) : r.sold_stats;
    const ss = typeof r.source_status === "string" ? JSON.parse(r.source_status) : r.source_status;
    console.log(
      JSON.stringify(
        {
          ts: r.ts,
          identity: `${r.manufacturer} ${r.model} ${r.caliber ?? ""}`,
          hammerEval: r.target_acquisition_cost,
          maxBid: r.max_bid,
          netProfit: r.net_profit,
          verdict: r.verdict,
          sold,
          sourceStatus: ss,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .then(() => c.close())
  .catch((e) => {
    console.error(e);
    c.close();
    process.exit(1);
  });
