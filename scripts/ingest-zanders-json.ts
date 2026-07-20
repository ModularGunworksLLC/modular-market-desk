/**
 * Ingest Zanders scrape JSON (array of listing products) into catalog_items.
 * Usage: npx tsx scripts/ingest-zanders-json.ts path/to/scrape.json
 */
import { readFileSync } from "node:fs";

import { upsertZandersProducts } from "../src/lib/zanders/upsert";
import type { ZandersListingProduct } from "../src/lib/zanders/parse-listing";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/ingest-zanders-json.ts <file.json>");
    process.exit(1);
  }
  const raw = readFileSync(path, "utf8");
  let products: ZandersListingProduct[];

  // CDP wrapper: { result: { result: { value: "<json string>" } } } or plain array
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    products = parsed as ZandersListingProduct[];
  } else if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    (parsed as { result?: { result?: { value?: string }; value?: string } }).result
  ) {
    const outer = (parsed as { result: { result?: { value?: string }; value?: string } }).result;
    const value = outer.result?.value ?? outer.value;
    if (typeof value !== "string") throw new Error("Unexpected CDP shape");
    products = JSON.parse(value) as ZandersListingProduct[];
  } else {
    throw new Error("Unrecognized JSON shape");
  }

  console.log(`> loaded ${products.length} Zanders rows from ${path}`);
  const report = await upsertZandersProducts(products);
  console.log(`> upserted=${report.upserted} skipped=${report.skipped} parsed=${report.parsed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
