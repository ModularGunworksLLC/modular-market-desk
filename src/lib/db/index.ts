/**
 * Drizzle client over the @libsql/client driver against a local SQLite file.
 *
 * The database lives on the persistent Lightsail disk (DATABASE_URL, e.g.
 * `file:./data/desk.db`). Reads are in-process - no network hop, no cold starts.
 * A module-level singleton survives Next.js HMR in dev and keeps one libsql
 * connection for the lifetime of the long-lived Node process in production.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/desk.db";

// For local file URLs, make sure the parent directory exists before libsql opens it.
if (databaseUrl.startsWith("file:")) {
  const filePath = databaseUrl.slice("file:".length);
  const dir = dirname(filePath);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __mmdLibsql: Client | undefined;
}

const client = globalThis.__mmdLibsql ?? createClient({ url: databaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalThis.__mmdLibsql = client;
}

export const db = drizzle(client, { schema });
export { schema };
