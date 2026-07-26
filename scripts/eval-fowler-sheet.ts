/**
 * One-shot: parse a Fowler CSV and evaluate via live desk API (or localhost).
 * Usage: npx tsx scripts/eval-fowler-sheet.ts [csvPath] [baseUrl]
 */

import { readFileSync, writeFileSync } from "node:fs";

import { parseBatchSheet } from "../src/lib/batch/parse";

const csvPath = process.argv[2] ?? `${process.env.TEMP}/fowler-sheet.csv`;
const base = (process.argv[3] ?? "https://desk.modulargunworks.com").replace(/\/$/, "");

const text = readFileSync(csvPath, "utf8");
const parsed = parseBatchSheet(text, { defaultBuyerPremiumPct: 10 });
const rows = parsed.rows.filter((r) => !r.unresolved && !r.excludeFromPricing);

const payload = {
  rows: rows.map((r) => ({
    rowNumber: r.rowNumber,
    lot: r.lot,
    manufacturer: r.manufacturer,
    model: r.model,
    caliber: r.caliber,
    category: r.category,
    upc: r.upc,
    lotTitle: r.rawTitle || "",
    currentBid: r.currentBid,
    requiredBid: r.requiredBid,
    bidIncrementAmount: r.bidIncrementAmount,
    buyerPremiumPct: 10,
  })),
  defaults: {
    condition: "any" as const,
    buyerPremiumPct: 10,
    inboundShip: 0,
    sellChannel: "local" as const,
    salesTaxPct: 9,
    targetProfit: 50,
    minMarginPct: 15,
    listingUpgrades: 0,
    buyerPaysOutboundShip: true,
    buyerPaysCardFee: true,
  },
};

console.error(`evaluable=${rows.length} skipped=${parsed.rows.length - rows.length} → ${base}/api/batch`);

const res = await fetch(`${base}/api/batch`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
  body: JSON.stringify(payload),
});

if (!res.ok || !res.body) {
  console.error("HTTP", res.status, await res.text());
  process.exit(1);
}

const results: Array<Record<string, unknown>> = [];
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const ev = JSON.parse(line) as { type: string; row?: Record<string, unknown> };
    if (ev.type === "result" && ev.row) results.push(ev.row);
  }
}

const ranked = results
  .filter((r) => r.verdict != null || (r.soldCount as number) > 0)
  .sort((a, b) => Number(b.headroom ?? -9999) - Number(a.headroom ?? -9999));

const summary = {
  bp: 10,
  exit: "local",
  targetProfit: 50,
  evaluated: results.length,
  go: results.filter((r) => r.verdict === "GO").length,
  nogo: results.filter((r) => r.verdict === "NO-GO").length,
  noComps: results.filter((r) => r.verdict == null && !r.error).length,
  errors: results.filter((r) => r.error).length,
  goLots: ranked
    .filter((r) => r.verdict === "GO")
    .map((r) => ({
      lot: r.lot,
      label: r.label,
      current: r.currentBid,
      next: r.nextBid,
      allIn: r.allInAtNext,
      marketMed: r.estimatedGrossResale,
      decisionP25: r.decisionP25,
      maxBid: r.maxBid,
      walk: r.walkAwayBid ?? r.walkAway,
      profit: r.netProfit,
      headroom: r.headroom,
      comps: r.soldCount,
      note: r.matchNote,
    })),
  watchNoGo: ranked
    .filter((r) => r.verdict === "NO-GO" && (r.headroom as number) > -150)
    .slice(0, 12)
    .map((r) => ({
      lot: r.lot,
      label: r.label,
      current: r.currentBid,
      marketMed: r.estimatedGrossResale,
      maxBid: r.maxBid,
      walk: r.walkAwayBid ?? r.walkAway,
      headroom: r.headroom,
      comps: r.soldCount,
    })),
  noCompsLots: results
    .filter((r) => r.verdict == null)
    .map((r) => ({ lot: r.lot, label: r.label, note: r.matchNote, err: r.error })),
};

writeFileSync(`${process.env.TEMP}/fowler-results.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
