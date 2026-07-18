/**
 * Idempotent apply of drizzle/0002_web_comps.sql (for DBs whose migration
 * journal predates web tables, or when db:init can't re-run older migrations).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@libsql/client";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/desk.db";
const client = createClient({ url: databaseUrl });

async function main() {
  const sqlPath = join(process.cwd(), "drizzle", "0002_web_comps.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const stmts = sql
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);

  console.log(`> applying web_comps DDL to ${databaseUrl}`);
  for (const stmt of stmts) {
    await client.execute(stmt);
    console.log("  ok:", stmt.slice(0, 72).replace(/\s+/g, " "));
  }

  const check = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'web_%' ORDER BY name",
  );
  console.log(
    "> tables:",
    check.rows.map((r) => r.name).join(", "),
  );
}

main()
  .then(() => {
    client.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    client.close();
    process.exit(1);
  });
