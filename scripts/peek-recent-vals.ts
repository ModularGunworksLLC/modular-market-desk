import { createClient } from "@libsql/client";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });

async function main() {
  const recent = await c.execute(
    "SELECT created_at, manufacturer, model, caliber, verdict, max_bid, net_profit, source_status FROM valuations ORDER BY created_at DESC LIMIT 25",
  );
  console.log("=== latest valuations ===");
  for (const row of recent.rows) {
    const ts = new Date(Number(row.created_at) * 1000).toISOString();
    const ss =
      typeof row.source_status === "string"
        ? JSON.parse(row.source_status as string)
        : (row.source_status as Record<string, string> | null);
    console.log(
      [
        ts,
        row.verdict,
        `${row.manufacturer} ${row.model} ${row.caliber ?? ""}`.trim(),
        `max=${row.max_bid}`,
        `profit=${row.net_profit}`,
        `web=${ss?.web ?? "-"}`,
        `gba=${String(ss?.gba ?? "-").slice(0, 80)}`,
      ].join(" | "),
    );
  }

  const n = await c.execute(
    "SELECT count(*) as n FROM valuations WHERE created_at >= strftime('%s','now','-2 hours')",
  );
  console.log("=== count last 2h ===", n.rows[0]?.n);

  try {
    const web = await c.execute(
      "SELECT canonical_key, confidence, count, domain_count, median, updated_at FROM web_price_stats ORDER BY updated_at DESC LIMIT 10",
    );
    console.log("=== web_price_stats ===");
    for (const row of web.rows) {
      console.log(row);
    }
  } catch (e) {
    console.log("web_price_stats:", (e as Error).message);
  }
}

main()
  .then(() => c.close())
  .catch((e) => {
    console.error(e);
    c.close();
    process.exit(1);
  });
