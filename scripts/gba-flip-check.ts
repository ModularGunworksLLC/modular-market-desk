/**
 * Live GBA comps → Lipsey-style undercut flip verdict.
 *
 * Token (first match wins):
 *   1. GBA_BEARER_TOKEN env (paste for one-off; do not commit)
 *   2. Session Vault: outdoor_analytics / market_api
 *
 * Usage:
 *   npm run flip:check -- Beretta "APX A1 Carry" 9mm 240.87
 *   GBA_BEARER_TOKEN=eyJ... npm run flip:check -- Beretta "APX A1 Carry" 9mm 240.87
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";

import { GbaApiClient } from "../src/lib/gba/client";
import { connections } from "../src/lib/db/schema";
import { decryptSecret, normalizeVaultSecret } from "../src/lib/vault";

function fvf(G: number): number {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}

function flipVerdict(list: number, allIn: number): { profit: number; code: string } {
  const profit = Math.round((list - fvf(list) - 8 - allIn) * 100) / 100;
  const code = profit >= 50 ? "GO" : profit >= 0 ? "BE" : "PASS";
  return { profit, code };
}

async function loadToken(): Promise<string | null> {
  const env = process.env.GBA_BEARER_TOKEN?.trim();
  if (env) return normalizeVaultSecret(env) || null;

  const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });
  const db = drizzle(c);
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.vendor, "outdoor_analytics"), eq(connections.kind, "market_api")))
    .limit(1);
  c.close();

  const row = rows[0];
  if (!row || row.status !== "active") return null;
  try {
    return normalizeVaultSecret(decryptSecret(row.secret)) || null;
  } catch {
    return null;
  }
}

async function main() {
  const [, , mfr, model, caliber, dealerStr] = process.argv;
  if (!mfr || !model || !dealerStr) {
    console.error(
      'Usage: npm run flip:check -- <manufacturer> "<model>" <caliber> <dealerPrice>',
    );
    console.error('Example: npm run flip:check -- Beretta "APX A1 Carry" 9mm 240.87');
    process.exit(1);
  }

  const dealer = Number.parseFloat(dealerStr);
  if (!Number.isFinite(dealer)) {
    console.error("Invalid dealer price:", dealerStr);
    process.exit(1);
  }

  const token = await loadToken();
  if (!token) {
    console.error("No GBA token. Either:");
    console.error("  1. Paste token at http://localhost:3000/import (Session Vault)");
    console.error("     vendor=outdoor_analytics, kind=market_api");
    console.error("  2. Or: GBA_BEARER_TOKEN=... npm run flip:check -- ...");
    process.exit(1);
  }

  const client = new GbaApiClient(token);
  console.log("Loading GBA dependencies (first run may take 1–3 min)...");
  const t0 = Date.now();

  const queries = [
    { manufacturer: mfr, model, caliber: caliber ?? "9mm", condition: "new" as const, category: "handgun" },
    { manufacturer: mfr, model, caliber: caliber ?? "9mm", condition: "any" as const, category: "handgun" },
    { manufacturer: mfr, model: "APX Carry", caliber: caliber ?? "9mm", condition: "new" as const, category: "handgun" },
    { manufacturer: mfr, model: "APX A1", caliber: caliber ?? "9mm", condition: "new" as const, category: "handgun" },
  ];

  let market = null;
  for (const q of queries) {
    const m = await client.resolveMarket(q);
    if (m && m.sold.count + m.asking.count > 0) {
      market = m;
      console.log(`Resolved: ${q.manufacturer} / ${q.model} → ${m.selection.manufacturer} ${m.selection.model} (${m.selection.caliber})`);
      break;
    }
    if (m) {
      console.log(`Match ${m.selection.model} but 0 comps, trying next alias...`);
    }
  }

  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s\n`);

  if (!market) {
    console.error("No GBA catalog match or zero comps. Try Model ID on desk home page.");
    process.exit(1);
  }

  const { sold, asking, soldRows, askingRows, selection, compMeta } = market;
  const allIn = dealer + 15;
  const undercut = Number(process.env.UNDERCUT ?? 40);

  const askingLow = asking.low > 0 ? asking.low : asking.p25;
  const soldMed = sold.median;
  const floorCandidates = [
    { label: "asking low", floor: askingLow },
    { label: "asking P25", floor: asking.p25 },
    { label: "sold median", floor: soldMed },
    { label: "sold P25", floor: sold.p25 },
  ].filter((x) => x.floor > 0);

  console.log("=== GBA COMPS ===");
  console.log(`Selection: ${selection.manufacturer} ${selection.model} ${selection.caliber} (${selection.conditionParam})`);
  console.log(`IDs: model=${selection.modelId} caliber=${selection.caliberId}`);
  console.log(`Sold: n=${sold.count} P25=$${sold.p25} med=$${sold.median} P75=$${sold.p75} low=$${sold.low} high=$${sold.high}`);
  console.log(`Ask:  n=${asking.count} P25=$${asking.p25} med=$${asking.median} low=$${asking.low} high=$${asking.high}`);
  if (compMeta.soldNonFirearmRemoved || compMeta.askingIncompleteRemoved) {
    console.log(
      `Filtered: sold -${compMeta.soldNonFirearmRemoved} non-firearm, asking -${compMeta.askingIncompleteRemoved} incomplete`,
    );
  }

  console.log("\n=== CHEAPEST ASKING (top 8) ===");
  for (const row of askingRows.slice(0, 8)) {
    console.log(`  $${row.price.toFixed(2).padStart(7)} | ${row.condition} | ${row.title.slice(0, 60)}`);
  }

  console.log("\n=== FLIP VERDICT (buyer pays ship, all-in $" + allIn + ") ===");
  for (const { label, floor } of floorCandidates) {
    const list = Math.round((floor - undercut) * 100) / 100;
    const { profit, code } = flipVerdict(list, allIn);
    console.log(`${code.padEnd(4)} @ ${label} floor $${floor} → list $${list} → profit $${profit}`);
  }

  const primary = floorCandidates[0];
  if (primary) {
    const list = primary.floor - undercut;
    const { profit, code } = flipVerdict(list, allIn);
    console.log(`\nPrimary read (${primary.label} − $${undercut}): ${code} — list ~$${list}, profit ~$${profit}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
