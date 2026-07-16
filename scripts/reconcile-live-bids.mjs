/**
 * Pull live Pearce bids and compare to tmp-pearce-bid-pass.csv CurrentBid column.
 */
import { readFileSync, writeFileSync } from "node:fs";

const BASES = [
  process.env.DESK_BASE,
  "http://localhost:3002",
  "http://localhost:3001",
  "http://localhost:3000",
].filter(Boolean);
const AUCTION_URL =
  process.env.AUCTION_URL ||
  "https://bids.auctionbypearce.com/auctions/47513-july-guns-gear--ammo-auction";

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function findBase() {
  for (const b of BASES) {
    try {
      const r = await fetch(`${b}/api/vault/status`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return b;
    } catch {
      /* try next */
    }
  }
  throw new Error("Desk not reachable on 3000/3001/3002 — start npm run dev");
}

const sheetLines = readFileSync("tmp-pearce-bid-pass.csv", "utf8").trim().split(/\r?\n/);
const sheetRows = sheetLines.slice(1).map(parseCsvLine).map((c) => ({
  lot: String(c[0]),
  action: c[1],
  sheetBid: c[2] ? Number(c[2]) : null,
  maxBid: c[3] ? Number(c[3]) : null,
  head: c[4] ? Number(c[4]) : null,
  gun: (c[7] || "").replace(/^"|"$/g, "").replace(/""/g, '"'),
}));
const bySheet = new Map(sheetRows.map((r) => [r.lot, r]));

const base = await findBase();
console.log("using Desk", base);
console.log("ingesting live auction…");

const res = await fetch(`${base}/api/auctions/ingest`, {
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

const liveLots = (json.sheetLots || [])
  .map((l) => ({
    lot: String(l.lot),
    lotN: Number(String(l.lot).replace(/\D/g, "")) || 0,
    title: String(l.title || ""),
    liveBid: l.currentBid == null ? null : Number(l.currentBid),
  }))
  .filter((l) => l.lotN >= 10 && l.lotN <= 231);

writeFileSync("tmp-pearce-sheet-lots.json", JSON.stringify(json.sheetLots || [], null, 2));

const matches = [];
const mismatches = [];
const sheetOnly = [];
const liveOnly = [];

const liveByLot = new Map(liveLots.map((l) => [l.lot, l]));

for (const s of sheetRows) {
  const live = liveByLot.get(s.lot);
  if (!live) {
    sheetOnly.push(s);
    continue;
  }
  const sheetBid = s.sheetBid;
  const liveBid = live.liveBid;
  const same =
    sheetBid == null && liveBid == null
      ? true
      : sheetBid != null && liveBid != null && Math.abs(sheetBid - liveBid) < 0.009;
  const row = {
    lot: s.lot,
    action: s.action,
    sheetBid,
    liveBid,
    delta: sheetBid != null && liveBid != null ? Math.round((liveBid - sheetBid) * 100) / 100 : null,
    maxBid: s.maxBid,
    // headroom vs LIVE bid if we have max
    liveHeadroom:
      s.maxBid != null && liveBid != null ? Math.round((s.maxBid - liveBid) * 100) / 100 : null,
    gun: s.gun.slice(0, 70),
    liveTitle: live.title.slice(0, 70),
  };
  if (same) matches.push(row);
  else mismatches.push(row);
}

for (const l of liveLots) {
  if (!bySheet.has(l.lot)) liveOnly.push(l);
}

mismatches.sort((a, b) => Number(a.lot) - Number(b.lot));
matches.sort((a, b) => Number(a.lot) - Number(b.lot));

// Action flips if live bid crossed maxBid
const flips = [];
for (const row of [...matches, ...mismatches]) {
  if (row.maxBid == null || row.liveBid == null || row.action === "NO COMPS" || row.action === "SKIP")
    continue;
  const liveWouldBid = row.liveBid <= row.maxBid;
  const sheetSaysBid = row.action === "BID";
  if (liveWouldBid !== sheetSaysBid) {
    flips.push({
      lot: row.lot,
      sheetAction: row.action,
      liveWould: liveWouldBid ? "BID" : "PASS",
      sheetBid: row.sheetBid,
      liveBid: row.liveBid,
      maxBid: row.maxBid,
      gun: row.gun,
    });
  }
}

const out = {
  pulledAt: new Date().toISOString(),
  auctionUrl: AUCTION_URL,
  deskBase: base,
  tallies: {
    sheetRows: sheetRows.length,
    liveInRange: liveLots.length,
    bidMatch: matches.length,
    bidMismatch: mismatches.length,
    sheetOnly: sheetOnly.length,
    liveOnly: liveOnly.length,
    actionFlipsVsLive: flips.length,
  },
  mismatches,
  flips,
  sheetOnly: sheetOnly.map((s) => ({ lot: s.lot, sheetBid: s.sheetBid, gun: s.gun })),
  liveOnly: liveOnly.map((l) => ({ lot: l.lot, liveBid: l.liveBid, title: l.title.slice(0, 70) })),
};

writeFileSync("tmp-pearce-bid-reconcile.json", JSON.stringify(out, null, 2));

const md = [];
md.push("# Pearce live bid reconcile");
md.push("");
md.push(`Pulled: ${out.pulledAt}`);
md.push("");
md.push(`| Check | Count |`);
md.push(`|---|---:|`);
md.push(`| Sheet lots | ${out.tallies.sheetRows} |`);
md.push(`| Live lots (10–231) | ${out.tallies.liveInRange} |`);
md.push(`| Current bid **match** | ${out.tallies.bidMatch} |`);
md.push(`| Current bid **mismatch** | ${out.tallies.bidMismatch} |`);
md.push(`| On sheet only | ${out.tallies.sheetOnly} |`);
md.push(`| Live only (not on sheet) | ${out.tallies.liveOnly} |`);
md.push(`| Action may flip vs live | ${out.tallies.actionFlipsVsLive} |`);
md.push("");

if (mismatches.length) {
  md.push("## Bid mismatches (sheet vs live)");
  md.push("");
  md.push("| Lot | Action | Sheet | Live | Δ | MaxBid | Live headroom | Gun |");
  md.push("|---:|:---|---:|---:|---:|---:|---:|---|");
  for (const r of mismatches) {
    md.push(
      `| ${r.lot} | ${r.action} | ${r.sheetBid ?? ""} | ${r.liveBid ?? ""} | ${r.delta ?? ""} | ${r.maxBid ?? ""} | ${r.liveHeadroom ?? ""} | ${r.gun} |`,
    );
  }
  md.push("");
} else {
  md.push("All sheet current bids match live high bids.");
  md.push("");
}

if (flips.length) {
  md.push("## Action may change (live bid vs MaxBid)");
  md.push("");
  md.push("| Lot | Sheet | Live says | Sheet $ | Live $ | MaxBid | Gun |");
  md.push("|---:|:---|:---|---:|---:|---:|---|");
  for (const f of flips) {
    md.push(
      `| ${f.lot} | ${f.sheetAction} | **${f.liveWould}** | ${f.sheetBid} | ${f.liveBid} | ${f.maxBid} | ${f.gun} |`,
    );
  }
}

writeFileSync("tmp-pearce-bid-reconcile.md", md.join("\n"));

console.log(JSON.stringify(out.tallies, null, 2));
if (mismatches.length) {
  console.log(
    "sample mismatches",
    mismatches.slice(0, 15).map((m) => `${m.lot}: sheet ${m.sheetBid} → live ${m.liveBid} (Δ ${m.delta})`),
  );
}
console.log("wrote tmp-pearce-bid-reconcile.md / .json");
