/**
 * CLI: pull Lipsey's CatalogFeed into catalog_items.
 *
 *   npm run lipseys:sync
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqAt = trimmed.indexOf("=");
    if (eqAt <= 0) continue;
    const key = trimmed.slice(0, eqAt).trim();
    let val = trimmed.slice(eqAt + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const { syncLipseysCatalog } = await import("../src/lib/lipseys/sync");
  console.log("> Lipsey's CatalogFeed →", process.env.DATABASE_URL ?? "file:./data/desk.db");
  const result = await syncLipseysCatalog();
  console.log(
    `ok vendor=${result.vendorName} parsed=${result.parsed} upserted=${result.upserted} skipped=${result.skipped}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
