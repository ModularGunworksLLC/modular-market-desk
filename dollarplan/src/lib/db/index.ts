import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/dollarplan.db";

if (databaseUrl.startsWith("file:")) {
  const filePath = databaseUrl.slice("file:".length);
  const dir = dirname(filePath);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __dollarplanLibsql: Client | undefined;
}

const client = globalThis.__dollarplanLibsql ?? createClient({ url: databaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dollarplanLibsql = client;
}

export const db = drizzle(client, { schema });
export { schema };
