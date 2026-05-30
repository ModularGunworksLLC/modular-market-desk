/**
 * One-shot, idempotent database bootstrap for the local SQLite (libsql) file.
 *
 *   1. Ensures the data directory exists.
 *   2. Applies the generated Drizzle migrations (tracked, so re-runs are no-ops).
 *   3. Seeds the four default distributor CSV presets (UPSERT - safe to re-run).
 *
 * Run with: npm run db:init
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { DEFAULT_PRESETS } from "../src/lib/csv/presets";
import { csvPresets } from "../src/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/desk.db";

if (databaseUrl.startsWith("file:")) {
  const dir = dirname(databaseUrl.slice("file:".length));
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const client = createClient({ url: databaseUrl });
const db = drizzle(client);

async function main(): Promise<void> {
  console.log(`> applying migrations to ${databaseUrl}`);
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log(`> seeding ${DEFAULT_PRESETS.length} distributor presets`);
  for (const preset of DEFAULT_PRESETS) {
    await db
      .insert(csvPresets)
      .values(preset)
      .onConflictDoUpdate({
        target: csvPresets.vendorName,
        set: {
          label: preset.label,
          delimiter: preset.delimiter ?? ",",
          encoding: preset.encoding ?? "utf-8",
          columnMap: preset.columnMap,
          updatedAt: new Date(),
        },
      });
  }

  console.log("> done: schema applied + presets seeded");
}

main()
  .then(() => {
    client.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error("db:init failed:", err);
    client.close();
    process.exit(1);
  });
