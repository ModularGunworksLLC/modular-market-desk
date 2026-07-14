/**
 * Inspect raw GBA sold rows for Mete MC9 — starting bid, bid count, etc.
 * Run: npx tsx scripts/probe-mc9-sold-raw.ts
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";

import { GbaApiClient } from "../src/lib/gba/client";
import { connections } from "../src/lib/db/schema";
import { decryptSecret } from "../src/lib/vault";

async function main() {
  const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });
  const db = drizzle(c);
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.vendor, "outdoor_analytics"), eq(connections.kind, "market_api")));
  if (!rows[0]) {
    console.error("No OA token — use production desk or paste token locally");
    process.exit(1);
  }
  const token = decryptSecret(rows[0].secret).replace(/^bearer\s+/i, "").trim();
  const client = new GbaApiClient(token);
  const market = await client.resolveMarket({
    manufacturer: "Canik",
    model: "Mete MC9",
    caliber: "9mm",
    category: "handgun",
    condition: "used",
  });
  if (!market) {
    console.error("No market match");
    process.exit(1);
  }

  // Raw API rows (before our field mapping)
  const base = process.env.GBA_API_BASE ?? "https://api.gunbrokeranalytics.com/gba-portal-api";
  const url = new URL(`${base}/pricing/data`);
  url.searchParams.set("modelID", String(market.selection.modelId));
  url.searchParams.set("caliberID", String(market.selection.caliberId));
  url.searchParams.set("condition", "Used");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-Skip-Cache": "true" },
  });
  const body = (await res.json()) as { data?: unknown[] } | unknown[];
  const raw = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown[] }).data) ? (body as { data: unknown[] }).data : [];
  if (raw[0]) console.log("RAW KEYS:", Object.keys(raw[0] as object).sort().join(", "));

  const cutoff = Date.now() - 30 * 86400000;
  const recent = (raw as Record<string, unknown>[])
    .map((row) => ({
      sold: Number(row.Amount),
      date: String(row.SalesDate ?? ""),
      type: String(row.ListingType ?? ""),
      title: String(row.ItemTitle ?? row.Title ?? "").slice(0, 60),
      start: row.StartingBid ?? row.StartBid ?? row.MinimumBid ?? row.OpeningBid,
      bids: row.BidCount ?? row.NumberOfBids ?? row.Bids ?? row.TotalBids,
      raw: row,
    }))
    .filter((r) => r.sold > 0 && Date.parse(r.date) >= cutoff)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  console.log(`\nLast 30 days: ${recent.length} sold rows\n`);
  for (const r of recent) {
    console.log(
      [r.date, `$${r.sold}`, r.type, `start=${r.start ?? "?"}`, `bids=${r.bids ?? "?"}`, r.title].join(" | "),
    );
  }

  if (recent[0]?.raw) {
    console.log("\nSample raw row:\n", JSON.stringify(recent[0].raw, null, 2));
  }
  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
