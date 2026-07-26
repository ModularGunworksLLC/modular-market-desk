/**
 * Ingest Davidson's site-scrape JSON into catalog_items.
 * Usage: npx tsx scripts/ingest-davidsons-json.ts path/to/scrape.json
 */
import { readFileSync } from "node:fs";

import { upsertDavidsonsProducts } from "../src/lib/davidsons/upsert";
import type { DavidsonsListingProduct } from "../src/lib/davidsons/parse-listing";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/ingest-davidsons-json.ts <file.json>");
    process.exit(1);
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  let products: DavidsonsListingProduct[];
  if (Array.isArray(parsed)) {
    products = parsed as DavidsonsListingProduct[];
  } else if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    (parsed as { result?: { result?: { value?: string }; value?: unknown } }).result
  ) {
    const outer = (parsed as { result: { result?: { value?: string }; value?: unknown } }).result;
    const value = outer.result?.value ?? outer.value;
    if (typeof value === "string") products = JSON.parse(value) as DavidsonsListingProduct[];
    else if (Array.isArray(value)) products = value as DavidsonsListingProduct[];
    else throw new Error("Unexpected CDP shape");
  } else {
    throw new Error("Unrecognized JSON shape");
  }

  console.log(`> loaded ${products.length} Davidson site rows from ${path}`);
  const report = await upsertDavidsonsProducts(products);
  console.log(`> upserted=${report.upserted} skipped=${report.skipped} parsed=${report.parsed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
