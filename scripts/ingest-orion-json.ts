/**
 * Ingest Orion scrape JSON (array of listing products) into catalog_items.
 * Usage: npx tsx scripts/ingest-orion-json.ts path/to/scrape.json
 */
import { readFileSync } from "node:fs";

import { upsertOrionProducts } from "../src/lib/orion/upsert";
import type { OrionListingProduct } from "../src/lib/orion/parse-listing";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/ingest-orion-json.ts <file.json>");
    process.exit(1);
  }
  const raw = readFileSync(path, "utf8");
  let products: OrionListingProduct[];

  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    products = parsed as OrionListingProduct[];
  } else if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    (parsed as { result?: { result?: { value?: string }; value?: string } }).result
  ) {
    const outer = (parsed as { result: { result?: { value?: string }; value?: string } }).result;
    const value = outer.result?.value ?? outer.value;
    if (typeof value !== "string") throw new Error("Unexpected CDP shape");
    products = JSON.parse(value) as OrionListingProduct[];
  } else {
    throw new Error("Unrecognized JSON shape");
  }

  console.log(`> loaded ${products.length} Orion rows from ${path}`);
  const report = await upsertOrionProducts(products);
  console.log(`> upserted=${report.upserted} skipped=${report.skipped} parsed=${report.parsed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
