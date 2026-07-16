/**
 * AI-resolve Pearce NO COMPS / SKIP lots via Desk /api/batch/identify (Gemini → OpenAI).
 *
 * Usage:
 *   node --import tsx scripts/ai-resolve-no-comps.mjs
 *
 * Env:
 *   DESK_BASE=http://localhost:3000
 *   AUCTION_URL=https://bids.auctionbypearce.com/auctions/47513-july-guns-gear--ammo-auction
 *   CHUNK=40
 *   MAX_IMAGES=2          # 0 = title-only
 *   SKIP_INGEST=1         # reuse tmp-pearce-sheet-lots.json
 *   SKIP_EVAL=1           # identify only, don't OA reprice
 *   LIMIT=20              # optional cap for smoke tests
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.DESK_BASE || "http://localhost:3000";
const AUCTION_URL =
  process.env.AUCTION_URL ||
  "https://bids.auctionbypearce.com/auctions/47513-july-guns-gear--ammo-auction";
const CHUNK = Math.min(80, Math.max(1, Number(process.env.CHUNK || 40)));
const MAX_IMAGES = Math.min(3, Math.max(0, Number(process.env.MAX_IMAGES || 2)));
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const SKIP_INGEST = process.env.SKIP_INGEST === "1";
const SKIP_EVAL = process.env.SKIP_EVAL === "1";

/** Pearce 15% BP × 1.03 CC − stacked effective % on hammer */
const PEARCE_BP_PLUS_CARD_PCT = 18.45;

function loadBidPass() {
  return JSON.parse(readFileSync("tmp-pearce-bid-pass.json", "utf8"));
}

async function ensureSheetLots() {
  const cache = "tmp-pearce-sheet-lots.json";
  if (SKIP_INGEST && existsSync(cache)) {
    console.log("reusing", cache);
    return JSON.parse(readFileSync(cache, "utf8"));
  }
  console.log("ingesting auction for titles + images…");
  const res = await fetch(`${BASE}/api/auctions/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: AUCTION_URL,
      buyerPremiumPct: 15,
      firearmsOnly: true,
      maxPages: 12,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `ingest ${res.status}`);
  const lots = (json.sheetLots || []).map((l) => ({
    lot: String(l.lot),
    title: String(l.title || ""),
    currentBid: l.currentBid ?? null,
    imageUrls: l.imageUrls || [],
  }));
  writeFileSync(cache, JSON.stringify(lots, null, 2));
  console.log("cached", lots.length, "lots →", cache);
  return lots;
}

async function identifyChunk(lots) {
  const res = await fetch(`${BASE}/api/batch/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lots: lots.map((l) => ({
        lot: l.lot,
        title: l.title,
        imageUrls: l.imageUrls || [],
        currentBid: l.currentBid,
        buyerPremiumPct: PEARCE_BP_PLUS_CARD_PCT,
      })),
      concurrency: 2,
      maxImagesPerLot: MAX_IMAGES,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(JSON.stringify(json?.error || json) || `identify ${res.status}`);
  return json;
}

async function probeIdentify() {
  console.log("probing identify (1 title-only lot)…");
  const res = await fetch(`${BASE}/api/batch/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lots: [
        {
          lot: "probe",
          title: "Ruger New Model Super Blackhawk 44 Mag Revolver",
          imageUrls: [],
          currentBid: 275,
        },
      ],
      concurrency: 1,
      maxImagesPerLot: 0,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("PROBE_FAIL", res.status, json);
    return false;
  }
  const r = json.results?.[0];
  console.log(
    "PROBE_OK",
    JSON.stringify({
      resolved: json.resolved,
      mfr: r?.manufacturer,
      model: r?.model,
      modelUsed: r?.modelUsed,
      err: r?.error,
    }),
  );
  return Boolean(r?.manufacturer && !r?.error);
}

async function evaluateRows(rows) {
  const out = [];
  const size = 50;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const n = Math.floor(i / size) + 1;
    console.log(`evaluate chunk ${n} (${chunk.length})…`);
    const res = await fetch(`${BASE}/api/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: chunk.map((r) => ({ ...r, buyerPremiumPct: PEARCE_BP_PLUS_CARD_PCT })),
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
  }
  return out;
}

const bidPass = loadBidPass();
const needLots = new Set(
  [...(bidPass.noComps || []), ...(bidPass.skip || [])].map((r) => String(r.lot)),
);
console.log("NO COMPS+SKIP targets:", needLots.size);

const ok = await probeIdentify();
if (!ok) {
  console.error(
    "Identify provider failed. Set a billed GEMINI_API_KEY or OPENAI_API_KEY in Desk .env and restart npm run dev.",
  );
  process.exit(2);
}

const sheetLots = await ensureSheetLots();
const byLot = new Map(sheetLots.map((l) => [String(l.lot), l]));

let targets = [...needLots]
  .map((lot) => {
    const sheet = byLot.get(lot);
    const fromPass = [...(bidPass.noComps || []), ...(bidPass.skip || [])].find(
      (r) => String(r.lot) === lot,
    );
    return {
      lot,
      title: sheet?.title || fromPass?.label || "",
      currentBid: sheet?.currentBid ?? fromPass?.bid ?? null,
      imageUrls: sheet?.imageUrls || [],
    };
  })
  .filter((t) => t.title);

if (LIMIT != null && Number.isFinite(LIMIT)) {
  targets = targets.slice(0, LIMIT);
  console.log("LIMIT active →", targets.length, "lots");
}

console.log(
  "resolving",
  targets.length,
  "lots; images/lot max",
  MAX_IMAGES,
  "; chunk",
  CHUNK,
);

const identifyResults = [];
for (let i = 0; i < targets.length; i += CHUNK) {
  const chunk = targets.slice(i, i + CHUNK);
  const n = Math.floor(i / CHUNK) + 1;
  const total = Math.ceil(targets.length / CHUNK);
  console.log(`identify ${n}/${total} (${chunk.length})…`);
  const json = await identifyChunk(chunk);
  console.log(`  resolved ${json.resolved} failed ${json.failed}`);
  identifyResults.push(...(json.results || []));
}

writeFileSync(
  "tmp-pearce-ai-identify-results.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      auctionUrl: AUCTION_URL,
      maxImages: MAX_IMAGES,
      targets: targets.length,
      results: identifyResults,
    },
    null,
    2,
  ),
);

const resolved = identifyResults.filter((r) => r.manufacturer && r.model && !r.error);
const failed = identifyResults.filter((r) => !r.manufacturer || !r.model || r.error);
console.log("identify summary", { resolved: resolved.length, failed: failed.length });

const evalRows = resolved.map((r, idx) => {
  const t = targets.find((x) => String(x.lot) === String(r.lot));
  return {
    rowNumber: idx + 1,
    lot: r.lot,
    manufacturer: r.manufacturer,
    model: r.model,
    caliber: r.caliber || "",
    category: r.category || "handgun",
    upc: "",
    currentBid: t?.currentBid ?? null,
    buyerPremiumPct: PEARCE_BP_PLUS_CARD_PCT,
  };
});
writeFileSync("tmp-pearce-ai-resolved-rows.json", JSON.stringify(evalRows, null, 2));

if (SKIP_EVAL || evalRows.length === 0) {
  console.log(
    JSON.stringify(
      {
        step: "identify-only",
        resolved: resolved.length,
        failed: failed.length,
        files: ["tmp-pearce-ai-identify-results.json", "tmp-pearce-ai-resolved-rows.json"],
        sampleFailed: failed.slice(0, 5).map((f) => ({ lot: f.lot, err: f.error, title: f.title?.slice(0, 50) })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const priced = await evaluateRows(evalRows);
writeFileSync(
  "tmp-pearce-ai-resolved-priced.json",
  JSON.stringify({ tallies: summarize(priced), results: priced }, null, 2),
);

function summarize(rows) {
  return {
    go: rows.filter((r) => r.verdict === "GO").length,
    nogo: rows.filter((r) => r.verdict === "NO-GO").length,
    noComps: rows.filter((r) => (r.soldCount ?? 0) === 0).length,
    total: rows.length,
  };
}

// Merge AI-priced lots back into full bid-pass from existing 10-231 results.
const prior = JSON.parse(readFileSync("tmp-pearce-lots-10-231-results.json", "utf8"));
const byPrior = new Map((prior.results || []).map((r) => [String(r.lot), r]));
for (const r of priced) byPrior.set(String(r.lot), r);

const merged = [...byPrior.values()].sort((a, b) => Number(a.lot) - Number(b.lot));
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
      step: "complete",
      identifyResolved: resolved.length,
      identifyFailed: failed.length,
      afterAiEval: summarize(priced),
      fullSheet: summarize(merged),
      files: [
        "tmp-pearce-ai-identify-results.json",
        "tmp-pearce-ai-resolved-rows.json",
        "tmp-pearce-ai-resolved-priced.json",
        "tmp-pearce-lots-10-231.csv",
      ],
      next: "node scripts/build-bid-pass-list.mjs",
    },
    null,
    2,
  ),
);
