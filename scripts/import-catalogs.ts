/**
 * Seed CSV presets and import distributor catalogs from local files.
 * Usage: npx tsx scripts/import-catalogs.ts [vendor ...]
 *   vendors: lipseys | zanders | davidsons | chattanooga | all (default: chattanooga davidsons)
 */

import { createReadStream, existsSync } from "node:fs";
import path from "node:path";

import { importCatalogCsv } from "../src/lib/csv/importer";
import { DEFAULT_PRESETS } from "../src/lib/csv/presets";
import { seedDefaultPresets } from "../src/lib/csv/seed-presets";

const DOWNLOADS = path.join(process.env.USERPROFILE ?? "", "Downloads");

const CATALOG_FILES: Record<string, string[]> = {
  chattanooga: [
    "Chattanooga - itemInventory (4).csv",
    "itemInventory (4).csv",
    "itemInventory.csv",
  ],
  davidsons: ["davidsons_inventory.csv", "davidsons_inventory (1).csv"],
  lipseys: [
    "Lipsey's-Catalog-24-05-2026,_20-29-30.csv",
    "Lipsey's-Catalog-21-05-2026,_21-56-19.csv",
    "Lipsey's-Catalog-10-04-2026,_22-08-17.csv",
  ],
  zanders: [],
};

function resolveFile(vendor: string): string | null {
  for (const name of CATALOG_FILES[vendor] ?? []) {
    const full = path.join(DOWNLOADS, name);
    if (existsSync(full)) return full;
  }
  return null;
}

async function importVendor(vendor: string): Promise<void> {
  const file = resolveFile(vendor);
  if (!file) {
    console.warn(`[${vendor}] No CSV found in Downloads — skipped.`);
    return;
  }

  const preset = DEFAULT_PRESETS.find((p) => p.vendorName === vendor);
  if (!preset) {
    console.error(`[${vendor}] No preset — run seed first.`);
    return;
  }

  console.log(`[${vendor}] Importing ${file} ...`);
  const result = await importCatalogCsv(createReadStream(file), {
    vendorName: vendor,
    columnMap: preset.columnMap,
    delimiter: preset.delimiter,
    sourceFile: path.basename(file),
  });

  console.log(
    `[${vendor}] ${result.upserted} upserted, ${result.parsed} parsed, ${result.skipped} skipped`,
  );
  if (result.debug) console.log(`[${vendor}] debug:`, result.debug);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const vendors =
    args.length === 0
      ? ["chattanooga", "davidsons"]
      : args[0] === "all"
        ? ["lipseys", "zanders", "davidsons", "chattanooga"]
        : args;

  console.log("Seeding presets...");
  const seed = await seedDefaultPresets();
  console.log(seed.message);
  if (!seed.ok) process.exit(1);

  for (const vendor of vendors) {
    await importVendor(vendor);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
