import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";

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
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}

loadDotEnv();
const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });
const r = await c.execute(
  "select vendor, kind, status, updated_at, length(secret) as secret_len from connections",
);
console.log(
  JSON.stringify(
    {
      envTokenPresent: Boolean(process.env.GBA_BEARER_TOKEN?.trim()),
      connections: r.rows,
    },
    null,
    2,
  ),
);
await c.close();
