/**
 * Re-evaluate Pearce NO COMPS lots after free OA model-cleanup changes.
 * Usage: DESK_BASE=http://localhost:3001 node --import tsx scripts/rematch-no-comps.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.DESK_BASE || "http://localhost:3000";
const PEARCE_BP_PLUS_CARD_PCT = 18.45;
const CHUNK = 40;

const bidPass = JSON.parse(readFileSync("tmp-pearce-bid-pass.json", "utf8"));
const retryRows = JSON.parse(readFileSync("tmp-pearce-10-231-retry-rows.json", "utf8"));
const byRetry = new Map(retryRows.map((r) => [String(r.lot), r]));

const need = [...(bidPass.noComps || []), ...(bidPass.skip || [])];
const rows = need
  .map((n) => {
    const r = byRetry.get(String(n.lot));
    if (!r) return null;
    return {
      ...r,
      buyerPremiumPct: PEARCE_BP_PLUS_CARD_PCT,
      currentBid: n.bid ?? r.currentBid,
    };
  })
  .filter(Boolean);

console.log("rematching", rows.length, "NO COMPS/SKIP lots against", BASE);

async function runChunk(chunk) {
  const res = await fetch(`${BASE}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: chunk,
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

const priced = [];
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  console.log(`chunk ${Math.floor(i / CHUNK) + 1} (${chunk.length})…`);
  priced.push(...(await runChunk(chunk)));
}

const stillNo = priced.filter((r) => (r.soldCount ?? 0) === 0);
const nowGo = priced.filter((r) => r.verdict === "GO");
const nowNogo = priced.filter((r) => r.verdict === "NO-GO");

writeFileSync(
  "tmp-pearce-no-comps-rematch.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      tallies: {
        attempted: priced.length,
        go: nowGo.length,
        nogo: nowNogo.length,
        stillNoComps: stillNo.length,
        rescued: priced.length - stillNo.length,
      },
      rescued: priced
        .filter((r) => (r.soldCount ?? 0) > 0)
        .map((r) => ({
          lot: r.lot,
          label: r.label,
          verdict: r.verdict,
          maxBid: r.maxBid,
          headroom: r.headroom,
          matchNote: r.matchNote,
        })),
      stillNoComps: stillNo.map((r) => ({ lot: r.lot, label: r.label, note: r.matchNote })),
      results: priced,
    },
    null,
    2,
  ),
);

const prior = JSON.parse(readFileSync("tmp-pearce-lots-10-231-results.json", "utf8"));
const byLot = new Map((prior.results || []).map((r) => [String(r.lot), r]));
for (const r of priced) byLot.set(String(r.lot), r);
const merged = [...byLot.values()].sort((a, b) => Number(a.lot) - Number(b.lot));

function summarize(list) {
  return {
    go: list.filter((r) => r.verdict === "GO").length,
    nogo: list.filter((r) => r.verdict === "NO-GO").length,
    noComps: list.filter((r) => (r.soldCount ?? 0) === 0).length,
    total: list.length,
  };
}

writeFileSync(
  "tmp-pearce-lots-10-231-results.json",
  JSON.stringify({ tallies: summarize(merged), results: merged }, null, 2),
);
writeFileSync(
  "tmp-pearce-lots-10-231.csv",
  [
    "Lot,Title/Label,Bid,MaxBid,Headroom,Verdict,Sold,P25,Median,Net,Status,MatchNote",
    ...merged.map((r) =>
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
        r.error ? "error" : r.soldCount ? r.verdict ?? "priced" : "no-comps",
        JSON.stringify(r.matchNote ?? ""),
      ].join(","),
    ),
  ].join("\n"),
);

console.log(
  JSON.stringify(
    {
      rematch: {
        attempted: priced.length,
        rescued: priced.length - stillNo.length,
        go: nowGo.length,
        nogo: nowNogo.length,
        stillNoComps: stillNo.length,
      },
      fullSheet: summarize(merged),
      next: "node scripts/build-bid-pass-list.mjs",
      sampleRescued: nowGo.slice(0, 8).map((r) => `${r.lot}|${r.label}|max ${r.maxBid}`),
    },
    null,
    2,
  ),
);
