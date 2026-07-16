/**
 * Rebuild tmp-pearce-bid-pass.* from last OA results + live Pearce high bids.
 */
import { readFileSync, writeFileSync } from "node:fs";

const money = (n) => (n == null || Number.isNaN(n) ? "" : `$${Math.round(n)}`);

const live = JSON.parse(readFileSync("tmp-pearce-sheet-lots.json", "utf8"));
const liveBy = new Map(live.map((l) => [String(l.lot), l]));
const recon = JSON.parse(readFileSync("tmp-pearce-bid-reconcile.json", "utf8"));
const prior = JSON.parse(readFileSync("tmp-pearce-lots-10-231-results.json", "utf8"));

const rows = (prior.results || [])
  .map((r) => {
    const lot = String(r.lot);
    const lotN = Number(lot.replace(/\D/g, "")) || 0;
    if (lotN < 10 || lotN > 231) return null;
    const L = liveBy.get(lot);
    const liveBid = L?.currentBid != null ? Number(L.currentBid) : r.currentBid ?? null;
    const maxBid = r.maxBid == null ? null : Number(r.maxBid);
    const sold = r.soldCount ?? 0;
    let action = "NO COMPS";
    let head = null;
    if (sold > 0 && maxBid != null && liveBid != null) {
      head = Math.round((maxBid - liveBid) * 100) / 100;
      action = liveBid <= maxBid ? "BID" : "PASS";
    } else if (r.matchNote === "unresolved title") {
      action = "SKIP";
    } else if (sold > 0 && r.verdict === "GO") {
      action = "BID";
    } else if (sold > 0 && r.verdict === "NO-GO") {
      action = "PASS";
    }
    return {
      lot,
      lotN,
      action,
      bid: liveBid,
      maxBid,
      head,
      med: r.soldMedian ?? null,
      sold,
      gun: L?.title || r.label || "",
      note: r.matchNote || "",
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.lotN - b.lotN);

const tallies = {
  bid: rows.filter((r) => r.action === "BID").length,
  pass: rows.filter((r) => r.action === "PASS").length,
  noComps: rows.filter((r) => r.action === "NO COMPS").length,
  skip: rows.filter((r) => r.action === "SKIP").length,
  total: rows.length,
  bidsUpdatedFromLive: recon.tallies.bidMismatch,
  actionFlipsVsLive: recon.tallies.actionFlipsVsLive,
};

const md = [];
md.push("# Pearce 47513 — Lots 10–231 (lot order, live bids)");
md.push("");
md.push(`Live high bids pulled: ${recon.pulledAt}`);
md.push("");
md.push("- **Auction terms (Pearce):** 15% BP + 3% card; local pickup $0 ship.");
md.push("- **Modeled all-in:** hammer × 1.1845; $3 GB listing; $50 target profit.");
md.push("- **Current** = live high bid. **MaxBid** from last OA eval (not re-priced).");
md.push("- Action refreshed vs live (BID if live ≤ MaxBid).");
md.push("");
md.push("| Bucket | Count |");
md.push("|---|---:|");
md.push(`| **BID** | ${tallies.bid} |`);
md.push(`| **PASS** | ${tallies.pass} |`);
md.push(`| **NO COMPS** | ${tallies.noComps} |`);
md.push(`| Bids updated from live | ${tallies.bidsUpdatedFromLive} |`);
md.push(`| Actions flipped by live bid | ${tallies.actionFlipsVsLive} |`);
md.push(`| **Total** | ${tallies.total} |`);
md.push("");
md.push("## Full list — lot 10 → 231");
md.push("");
md.push("| Lot | Action | Live bid | MaxBid | Headroom | Sold med | Sold # | Gun |");
md.push("|---:|:---|---:|---:|---:|---:|---:|---|");
for (const r of rows) {
  const max = r.action === "BID" || r.action === "PASS" ? money(r.maxBid) : "";
  const head = r.head == null ? "" : money(r.head);
  md.push(
    `| ${r.lot} | **${r.action}** | ${money(r.bid)} | ${max} | ${head} | ${r.sold ? money(r.med) : ""} | ${r.sold || ""} | ${String(r.gun).slice(0, 72)} |`,
  );
}

writeFileSync("tmp-pearce-bid-pass.md", md.join("\n"));
writeFileSync(
  "tmp-pearce-bid-pass.csv",
  [
    "Lot,Action,CurrentBid,MaxBid,Headroom,SoldMedian,SoldCount,Gun,MatchNote",
    ...rows.map((r) =>
      [
        r.lot,
        r.action,
        r.bid ?? "",
        r.maxBid ?? "",
        r.head ?? "",
        r.med ?? "",
        r.sold || "",
        JSON.stringify(r.gun),
        JSON.stringify(r.note),
      ].join(","),
    ),
  ].join("\n"),
);
writeFileSync(
  "tmp-pearce-bid-pass.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      livePulledAt: recon.pulledAt,
      sort: "lot",
      tallies,
      rows,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ tallies, sampleFlips: recon.flips }, null, 2));
console.log(
  "spot",
  rows
    .filter((r) => ["11", "64", "65", "87"].includes(r.lot))
    .map((r) => ({ lot: r.lot, action: r.action, live: r.bid, max: r.maxBid, head: r.head })),
);
