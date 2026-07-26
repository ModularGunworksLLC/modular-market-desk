import { createClient } from "@libsql/client";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });

async function main() {
  const recent = await c.execute(
    `SELECT count(*) as n,
            sum(case when json_extract(sold_stats,'$.count') > 0 then 1 else 0 end) as with_sold,
            sum(case when json_extract(source_status,'$.web') like '%insufficient%' then 1 else 0 end) as web_insuff,
            sum(case when json_extract(source_status,'$.web') like '%web aggregate%' then 1 else 0 end) as web_ok,
            sum(case when json_extract(source_status,'$.gba') like '%excluded%' then 1 else 0 end) as excluded
     FROM valuations WHERE created_at >= strftime('%s','now','-8 hours')`,
  );
  console.log("valuations_8h", recent.rows[0]);

  const web = await c.execute(
    `SELECT confidence, count(*) as n FROM web_price_stats GROUP BY confidence ORDER BY n DESC`,
  );
  console.log("web_stats_by_conf", web.rows);

  const fresh = await c.execute(
    `SELECT canonical_key, confidence, count, domain_count, median,
            datetime(updated_at,'unixepoch') as updated
     FROM web_price_stats ORDER BY updated_at DESC LIMIT 12`,
  );
  console.log("latest_web_stats");
  for (const r of fresh.rows) console.log(r);
}

main()
  .then(() => c.close())
  .catch((e) => {
    console.error(e);
    c.close();
    process.exit(1);
  });
