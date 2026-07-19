import { createClient } from "@libsql/client";

async function main() {
  const c = createClient({ url: "file:./data/desk.db" });
  const counts = await c.execute(
    "SELECT last_status, COUNT(*) n FROM tgv_models GROUP BY last_status ORDER BY n DESC",
  );
  console.log("status", counts.rows);

  const ok = await c.execute(
    "SELECT manufacturer, model, category, tgv_path FROM tgv_models WHERE last_status = 'ok' ORDER BY synced_at DESC LIMIT 12",
  );
  console.log("\nOK sample:");
  for (const r of ok.rows) console.log(`  ${r.manufacturer} | ${r.model} | ${r.category} → ${r.tgv_path}`);

  const nf = await c.execute(
    "SELECT manufacturer, model, category, tgv_path, last_error FROM tgv_models WHERE last_status = 'not_found' ORDER BY updated_at DESC LIMIT 25",
  );
  console.log("\nNF sample:");
  for (const r of nf.rows) {
    console.log(`  ${r.manufacturer} | ${r.model} | ${r.category} → ${r.tgv_path}`);
    if (r.last_error) console.log(`    err: ${r.last_error}`);
  }

  const stats = await c.execute("SELECT COUNT(*) n FROM tgv_model_stats");
  const comps = await c.execute("SELECT COUNT(*) n FROM tgv_sold_comps");
  console.log("\nstats rows", stats.rows[0], "comps", comps.rows[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
