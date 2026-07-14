/**
 * Quick live test: vault token → dependencies → resolve → sold count.
 * Run: npm run test:gba
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";

import { GbaApiClient } from "../src/lib/gba/client";
import { connections } from "../src/lib/db/schema";
import { decryptSecret } from "../src/lib/vault";

const queries = [
  { manufacturer: "Glock", model: "19", caliber: "9mm", condition: "new" as const },
  { manufacturer: "Savage", model: "1911", caliber: "45 ACP", condition: "new" as const },
  { manufacturer: "Savage Arms", model: "1911", caliber: "45 ACP", condition: "any" as const },
  { manufacturer: "Beretta", model: "92", caliber: "9mm", condition: "new" as const },
];

async function main() {
  const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });
  const db = drizzle(c);
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.vendor, "outdoor_analytics"), eq(connections.kind, "market_api")));
  if (!rows[0]) {
    console.error("No token in vault");
    process.exit(1);
  }
  let token: string;
  try {
    token = decryptSecret(rows[0].secret);
  } catch (e) {
    console.error("Decrypt failed:", (e as Error).message);
    process.exit(1);
  }
  if (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  console.log("Token length:", token.length);

  const client = new GbaApiClient(token);
  console.log("Fetching dependencies (may take 1–3 min)...");
  const t0 = Date.now();
  const deps = await client.dependencies();
  console.log("Dependencies loaded in", Math.round((Date.now() - t0) / 1000), "s");
  const newCount = Array.isArray(deps.NEW) ? deps.NEW.length : 0;
  const usedCount = Array.isArray(deps.USED) ? deps.USED.length : 0;
  console.log("Manufacturers: NEW=", newCount, "USED=", usedCount);

  for (const q of queries) {
    const t1 = Date.now();
    const market = await client.resolveMarket(q);
    const ms = Date.now() - t1;
    if (!market) {
      console.log("FAIL", q.manufacturer, q.model, q.caliber, `(${ms}ms) no match`);
      continue;
    }
    const s = market.selection;
    console.log(
      "OK  ",
      q.manufacturer,
      q.model,
      "→",
      s.manufacturer,
      s.model,
      s.caliber,
      `| sold=${market.sold.count} asking=${market.asking.count}`,
      `| ${ms}ms`,
    );
  }
  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
