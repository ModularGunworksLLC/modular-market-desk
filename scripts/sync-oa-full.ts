/**
 * Full OA sync: catalog + sold/asking comps for every leaf.
 *
 *   npm run oa:sync
 *   OA_SYNC_LIMIT=20 npm run oa:sync          # smoke test
 *   OA_SYNC_FORCE=1 npm run oa:sync           # ignore fresh skip
 *   OA_SYNC_COMPS_ONLY=1 npm run oa:sync      # skip catalog refresh
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { syncOaFull } from "../src/lib/oa/sync-full";

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
  const limit = process.env.OA_SYNC_LIMIT ? Number(process.env.OA_SYNC_LIMIT) : undefined;
  const forceComps = process.env.OA_SYNC_FORCE === "1";
  const compsOnly = process.env.OA_SYNC_COMPS_ONLY === "1";
  console.log(
    `> full OA sync → ${process.env.DATABASE_URL ?? "file:./data/desk.db"}` +
      (limit ? ` limit=${limit}` : "") +
      (forceComps ? " force" : "") +
      (compsOnly ? " comps-only" : ""),
  );

  const report = await syncOaFull({
    token: process.env.GBA_BEARER_TOKEN?.trim() || undefined,
    forceComps,
    limit: Number.isFinite(limit) ? limit : undefined,
    compsOnly,
    concurrency: process.env.OA_SYNC_CONCURRENCY ? Number(process.env.OA_SYNC_CONCURRENCY) : 3,
  });

  if (report.catalog) {
    const c = report.catalog.coverage;
    console.log(
      `> catalog: ${c.rows} rows | brands ${c.manufacturersUnique} | models ${c.modelsUnique}`,
    );
  }
  if (report.comps) {
    const p = report.comps.progress;
    console.log(
      `> comps: ${p.processed}/${p.total} | withSold ${p.withSold} | zeroSold ${p.zeroSold} | asking ${p.withAsking} | errors ${p.errors} | ${report.comps.seconds}s`,
    );
  }
  console.log(">", report.note);
}

const isMain =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("oa:sync failed:", err);
    process.exit(1);
  });
}
