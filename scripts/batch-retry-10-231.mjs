import { readFileSync, writeFileSync } from "node:fs";

/**
 * Pearce 47513 terms (from auction page) + dealer rules (from user):
 * - Buy: 15% BP + 3% CC on invoice total → all-in ≈ hammer × 1.1845 (Desk models as BP 18.45%)
 * - Buy: local pickup → inboundShip $0
 * - Sell: buyer pays ship + CC; dealer pays $3 GB listing upgrades; $50 target profit
 *
 * Auction BP/CC MUST come from that auction's terms — do not reuse these for other houses.
 */
const BASE = process.env.DESK_BASE || "http://localhost:3000";
const CHUNK = 50;
const rows = JSON.parse(readFileSync("tmp-pearce-10-231-retry-rows.json", "utf8"));

/** Pearce 15% BP × (1 + 3% CC) − 1 → 18.45% effective on hammer */
const PEARCE_BP_PLUS_CARD_PCT = 18.45;

async function runChunk(chunk) {
  const rowsForApi = chunk.map((r) => ({
    ...r,
    // Force this auction's terms; sheet column BP must not override.
    buyerPremiumPct: PEARCE_BP_PLUS_CARD_PCT,
  }));
  const res = await fetch(`${BASE}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: rowsForApi,
      defaults: {
        condition: "used",
        buyerPremiumPct: PEARCE_BP_PLUS_CARD_PCT,
        inboundShip: 0,
        outboundShip: 0,
        listingUpgrades: 3,
        buyerPaysOutboundShip: true,
        buyerPaysCardFee: true,
        targetProfit: 50,
      },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`batch ${res.status} ${await res.text()}`);
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

console.log("evaluating", rows.length, "lots in chunks of", CHUNK);
const results = [];
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const n = Math.floor(i / CHUNK) + 1;
  console.log(`chunk ${n} (${chunk.length})...`);
  const part = await runChunk(chunk);
  results.push(...part);
  console.log("  total", results.length);
}

const ranked = [...results].sort((a, b) => Number(a.lot) - Number(b.lot));
const go = ranked.filter((r) => r.verdict === "GO").length;
const nogo = ranked.filter((r) => r.verdict === "NO-GO").length;
const noComps = ranked.filter((r) => (r.soldCount ?? 0) === 0).length;

writeFileSync(
  "tmp-pearce-lots-10-231.csv",
  [
    "Lot,Title/Label,Bid,MaxBid,Headroom,Verdict,Sold,P25,Median,Net,Status,MatchNote",
    ...ranked.map((r) =>
      [
        r.lot,
        JSON.stringify(r.label ?? ""),
        r.currentBid ?? "",
        r.maxBid ?? "",
        r.headroom ?? "",
        r.verdict ?? "",
        r.soldCount ?? "",
        r.soldP25 ?? "",
        r.soldMedian ?? "",
        r.netProfit ?? "",
        r.error ? "error" : r.soldCount ? (r.verdict ?? "priced") : "no-comps",
        JSON.stringify(r.matchNote ?? ""),
      ].join(","),
    ),
  ].join("\n"),
);
writeFileSync(
  "tmp-pearce-lots-10-231-results.json",
  JSON.stringify({ tallies: { go, nogo, noComps, total: ranked.length }, results: ranked }, null, 2),
);

console.log(JSON.stringify({ tallies: { go, nogo, noComps, total: ranked.length }, file: "tmp-pearce-lots-10-231.csv" }, null, 2));
console.log(
  "top GO",
  ranked
    .filter((r) => r.verdict === "GO")
    .sort((a, b) => (b.headroom ?? 0) - (a.headroom ?? 0))
    .slice(0, 12)
    .map((r) => `${r.lot}|${r.label}|bid ${r.currentBid}|max ${r.maxBid}|head ${r.headroom}`),
);
