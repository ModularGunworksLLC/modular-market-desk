/**
 * OA-gap TGV drip into local SQLite.
 *
 *   npm run tgv:sync
 *   TGV_SYNC_LIMIT=20 npm run tgv:sync
 *   TGV_DRIP_DELAY_MS=3000 npm run tgv:sync
 *   TGV_COOKIE="..." npm run tgv:sync          # optional CF cookie
 *   TGV_USE_PLAYWRIGHT=0 npm run tgv:sync      # force plain fetch only
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { syncTgvOaGaps } from "../src/lib/tgv/sync-drip";

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const limit = process.env.TGV_SYNC_LIMIT ? Number(process.env.TGV_SYNC_LIMIT) : undefined;
  console.log(
    `> TGV OA-gap drip → ${process.env.DATABASE_URL ?? "file:./data/desk.db"}` +
      (limit ? ` limit=${limit}` : "") +
      (process.env.TGV_COOKIE ? " cookie=yes" : " cookie=no"),
  );

  const report = await syncTgvOaGaps({
    limit: Number.isFinite(limit) ? limit : undefined,
    delayMs: process.env.TGV_DRIP_DELAY_MS ? Number(process.env.TGV_DRIP_DELAY_MS) : undefined,
    cookie: process.env.TGV_COOKIE,
    usePlaywright: process.env.TGV_USE_PLAYWRIGHT !== "0",
  });

  console.log(">", report.note);
  if (report.error) console.error(">", report.error);
  const p = report.progress;
  console.log(
    `> progress: ${p.processed}/${p.total} ok=${p.ok} notFound=${p.notFound} blocked=${p.blocked} errors=${p.errors}`,
  );
  if (report.status !== "ok") process.exit(1);
}

const isMain =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("tgv:sync failed:", err);
    process.exit(1);
  });
}
