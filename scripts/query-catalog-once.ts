import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });
const upc = process.argv[2] ?? "723364231322";

const upcRows = await db.execute({
  sql: `SELECT vendor_name, sku, model, dealer_price, in_stock, description
        FROM catalog_items WHERE upc = ? ORDER BY dealer_price`,
  args: [upc],
});
console.log("UPC", upc, "matches:", upcRows.rows.length);
for (const r of upcRows.rows) console.log(r);

const lipseyPdpF = await db.execute({
  sql: `SELECT vendor_name, model, dealer_price, in_stock, description, category
        FROM catalog_items
        WHERE vendor_name = 'lipseys' AND manufacturer LIKE '%WALTHER%'
          AND (model LIKE '%PDP F%' OR model LIKE '%PDP Full%')
        ORDER BY dealer_price LIMIT 25`,
  args: [],
});
console.log("\nLipseys PDP F / Full rows:", lipseyPdpF.rows.length);
for (const r of lipseyPdpF.rows) console.log(r);
