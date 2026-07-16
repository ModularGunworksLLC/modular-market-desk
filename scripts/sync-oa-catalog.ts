/**
 * CLI wrapper for OA catalog sync (same logic as Import → OA sync UI).
 *
 *   npm run oa:sync-catalog
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { syncOaCatalog } from "../src/lib/oa/sync-catalog";

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
  console.log("> syncing OA catalog into", process.env.DATABASE_URL ?? "file:./data/desk.db");
  const report = await syncOaCatalog(
    process.env.GBA_BEARER_TOKEN?.trim()
      ? { token: process.env.GBA_BEARER_TOKEN.trim() }
      : undefined,
  );
  const c = report.coverage;
  const d = report.diff;
  console.log(
    `> ok: ${c.rows} rows | brands unique ${c.manufacturersUnique} (NEW ${c.manufacturersNew} / USED ${c.manufacturersUsed}) | models unique ${c.modelsUnique}`,
  );
  console.log(
    `> diff: +${d.brandsAddedTotal} brands / -${d.brandsRemovedTotal} brands · +${d.modelsAddedTotal} models / -${d.modelsRemovedTotal} models`,
  );
  if (d.brandsAdded.length) console.log("  brands added:", d.brandsAdded.slice(0, 15).join("; "));
  if (d.modelsAdded.length) {
    console.log(
      "  models added:",
      d.modelsAdded
        .slice(0, 10)
        .map((m) => `${m.manufacturer} ${m.model}`)
        .join("; "),
    );
  }
  console.log(">", report.note);
}

const isMain =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("oa:sync-catalog failed:", err);
    process.exit(1);
  });
}
