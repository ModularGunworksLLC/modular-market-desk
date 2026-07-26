import { createClient } from "@libsql/client";

async function main() {
  const c = createClient({ url: "file:./data/desk.db" });
  await c.execute("PRAGMA wal_checkpoint(FULL)");
  const r = await c.execute(
    "SELECT vendor_name, COUNT(*) AS n FROM catalog_items GROUP BY vendor_name ORDER BY n DESC",
  );
  console.log(r.rows);
  const z = await c.execute(
    "SELECT COUNT(*) AS n FROM catalog_items WHERE vendor_name = 'zanders'",
  );
  console.log("zanders exact", z.rows[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
