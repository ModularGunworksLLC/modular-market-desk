/**
 * MC9 sold comp detail — start bid & bid count when OA provides them.
 * Run: npx tsx scripts/mc9-sold-detail.ts
 * Needs DATABASE_URL + SESSION_VAULT_KEY (or production deploy + curl evaluate).
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
  if (!rows[0]) throw new Error("No OA token in vault");
  const token = decryptSecret(rows[0].secret).replace(/^bearer\s+/i, "").trim();
  const client = new GbaApiClient(token);
  const market = await client.resolveMarket({
    manufacturer: "Canik",
    model: "Mete MC9",
    caliber: "9mm",
    category: "handgun",
    condition: "used",
  });
  if (!market) throw new Error("No MC9 match");

  const cutoff = Date.now() - 30 * 86400000;
  const all = await client.pricingDataRows({
    modelId: market.selection.modelId,
    caliberId: market.selection.caliberId,
    condition: "Used",
  });

  const recent = all
    .filter((r) => {
      const t = Date.parse(r.salesDate);
      return t >= cutoff && t <= Date.now();
    })
    .sort((a, b) => Date.parse(b.salesDate) - Date.parse(a.salesDate));

  const hasStart = recent.some((r) => r.startingBid != null);
  const hasBids = recent.some((r) => r.bidCount != null);

  console.log(`MC9 Used — ${recent.length} sold in last 30 days (of ${all.length} total OA rows)`);
  console.log(`OA includes startingBid: ${hasStart} | bidCount: ${hasBids}\n`);

  console.log("Date       | Sold    | Start   | Bids | Type");
  console.log("-----------|---------|---------|------|------------------");
  for (const r of recent) {
    const start = r.startingBid != null ? `$${r.startingBid.toFixed(2)}` : "—";
    const bids = r.bidCount != null ? String(r.bidCount) : "—";
    console.log(
      `${r.salesDate.padEnd(10)} | $${String(r.price).padStart(6)} | ${start.padStart(7)} | ${bids.padStart(4)} | ${r.listingType}`,
    );
  }

  const withBids = recent.filter((r) => r.bidCount != null && r.startingBid != null);
  if (withBids.length) {
    const avgStart = withBids.reduce((s, r) => s + (r.startingBid ?? 0), 0) / withBids.length;
    const avgSold = withBids.reduce((s, r) => s + r.price, 0) / withBids.length;
    const avgBids = withBids.reduce((s, r) => s + (r.bidCount ?? 0), 0) / withBids.length;
    console.log(`\n30d avg (rows with bid detail): start $${avgStart.toFixed(2)} → sold $${avgSold.toFixed(2)} | ${avgBids.toFixed(1)} bids avg`);
  }

  c.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
