import { defineConfig } from "drizzle-kit";

// Local SQLite file (libsql). e.g. file:./data/desk.db on the Lightsail disk.
const url = process.env.DATABASE_URL ?? "file:./data/desk.db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    // Empty for a local file; set for a remote Turso/libsql endpoint.
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
  strict: true,
  verbose: true,
});
