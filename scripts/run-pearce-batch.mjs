/**
 * Chunked Pearce auction batch → ranked buy-sheet.
 * Usage: npx tsx scripts/run-pearce-batch.mjs [csvPath]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseBatchSheet } from "../src/lib/batch/parse.ts";

const BASE = process.env.DESK_BASE || "http://localhost:3000";
const csvPath = process.argv[2] || "tmp-pearce-47513.csv";
const bp = Number(process.env.BP || 15);
const CHUNK = Number(process.env.CHUNK || 60);

async function runChunk(rows) {
  const res = await fetch(`${BASE}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: rows.map((r) => ({
        rowNumber: r.rowNumber,
        lot: r.lot,
        manufacturer: r.manufacturer,
        model: r.model,
        caliber: r.caliber,
        category: r.category,
        upc: r.upc,
        currentBid: r.currentBid,
        buyerPremiumPct: r.buyerPremiumPct ?? bp,
      })),
      defaults: {
        condition: "used",
        buyerPremiumPct: bp,
        inboundShip: 0,
        outboundShip: 45,
        listingUpgrades: 3,
        buyerPaysOutboundShip: true,
        buyerPaysCardFee: true,
        targetProfit: 50,
      },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text();
    throw new Error(`batch HTTP ${res.status}: ${t.slice(0, 400)}`);
  }
  const out = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line);
      if (ev.type === "result") out.push(ev.row);
    }
  }
  return out;
}

const csv = readFileSync(csvPath, "utf8");
const parsed = parseBatchSheet(csv, { defaultBuyerPremiumPct: bp });
const evaluable = parsed.rows.filter((r) => !r.unresolved);
const unresolved = parsed.rows.filter((r) => r.unresolved);

console.log(
  JSON.stringify({
    step: "parsed",
    total: parsed.rows.length,
    evaluable: evaluable.length,
    unresolved: unresolved.length,
    chunks: Math.ceil(evaluable.length / CHUNK),
    warnings: parsed.warnings,
  }),
);
const results = [];
for (let i = 0; i < evaluable.length; i += CHUNK) {
  const chunk = evaluable.slice(i, i + CHUNK);
  const n = Math.floor(i / CHUNK) + 1;
  const totalChunks = Math.ceil(evaluable.length / CHUNK);
  console.log(`chunk ${n}/${totalChunks} (${chunk.length} lots)...`);
  const part = await runChunk(chunk);
  results.push(...part);
  console.log(`  got ${part.length}; total ${results.length}`);
}

const ranked = [...results].sort((a, b) => (b.headroom ?? -1e9) - (a.headroom ?? -1e9));
const go = ranked.filter((r) => r.verdict === "GO");
const nogo = ranked.filter((r) => r.verdict === "NO-GO");
const noComps = ranked.filter((r) => (r.soldCount ?? 0) === 0);

const out = {
  auction: "47513-july-guns-gear--ammo-auction",
  buyerPremiumPct: bp,
  evaluatedAt: new Date().toISOString(),
  parsed: {
    total: parsed.rows.length,
    evaluable: evaluable.length,
    unresolved: unresolved.length,
  },
  tallies: { go: go.length, nogo: nogo.length, noComps: noComps.length, errored: ranked.filter((r) => r.error).length },
  unresolvedLots: unresolved.map((r) => ({ lot: r.lot, title: r.rawTitle, bid: r.currentBid })),
  topGo: go.slice(0, 50),
  results: ranked,
};

writeFileSync("tmp-pearce-47513-results.json", JSON.stringify(out, null, 2));
writeFileSync(
  "tmp-pearce-47513-results.csv",
  [
    "Lot,Label,Category,Bid,MaxBid,Headroom,Verdict,SoldCount,P25,Median,Net,MatchNote,Error",
    ...ranked.map((r) =>
      [
        r.lot,
        JSON.stringify(r.label ?? ""),
        r.category ?? "",
        r.currentBid ?? "",
        r.maxBid ?? "",
        r.headroom ?? "",
        r.verdict ?? "",
        r.soldCount ?? "",
        r.soldP25 ?? "",
        r.soldMedian ?? "",
        r.netProfit ?? "",
        JSON.stringify(r.matchNote ?? ""),
        JSON.stringify(r.error ?? ""),
      ].join(","),
    ),
  ].join("\n"),
);

console.log(
  JSON.stringify(
    {
      step: "complete",
      tallies: out.tallies,
      unresolved: unresolved.length,
      files: ["tmp-pearce-47513-results.json", "tmp-pearce-47513-results.csv"],
      topGo: go.slice(0, 15).map((r) => ({
        lot: r.lot,
        label: r.label,
        bid: r.currentBid,
        maxBid: r.maxBid,
        headroom: r.headroom,
        sold: r.soldCount,
        note: r.matchNote,
      })),
    },
    null,
    2,
  ),
);
