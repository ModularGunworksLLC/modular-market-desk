import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { ensureHousehold } from "../src/lib/services/budget";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/dollarplan.db";

if (databaseUrl.startsWith("file:")) {
  const dir = dirname(databaseUrl.slice("file:".length));
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const client = createClient({ url: databaseUrl });
const db = drizzle(client);

async function main(): Promise<void> {
  console.log(`> applying migrations to ${databaseUrl}`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("> seeding default household");
  await ensureHousehold();
  console.log("> done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
