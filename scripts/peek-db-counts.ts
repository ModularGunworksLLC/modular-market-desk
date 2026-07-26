import { createClient } from "@libsql/client";

async function main() {
  const label = process.argv[2] ?? "db";
  const url = process.argv[3] ?? "file:./data/desk.db";

  const c = createClient({ url });
  const tables = [
    "tgv_models",
    "tgv_model_stats",
    "tgv_sold_comps",
    "oa_catalog",
    "oa_market_stats",
    "oa_sold_comps",
    "catalog_items",
    "connections",
    "valuations",
  ];

  for (const t of tables) {
    try {
      const r = await c.execute(`SELECT COUNT(*) AS n FROM ${t}`);
      console.log(`${label}\t${t}\t${r.rows[0]?.n}`);
    } catch {
      console.log(`${label}\t${t}\tMISSING`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
