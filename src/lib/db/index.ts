/**
 * Drizzle client over the postgres.js driver.
 *
 * We run as a long-lived Node process on Lightsail, so a small persistent TCP pool to Neon is
 * ideal (no per-request connection churn). A module-level singleton survives Next.js HMR in dev.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure Neon.");
}

declare global {
  // eslint-disable-next-line no-var
  var __mmdPg: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__mmdPg ??
  postgres(databaseUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 30,
    ssl: "require",
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__mmdPg = client;
}

export const db = drizzle(client, { schema });
export { schema };
