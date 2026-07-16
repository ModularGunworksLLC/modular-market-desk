import { readFileSync, writeFileSync } from "node:fs";
import { parseBatchSheet } from "../src/lib/batch/parse.ts";

const j = JSON.parse(readFileSync("tmp-pearce-lots-10-231-results.json", "utf8"));
const csv = readFileSync("tmp-pearce-47513.csv", "utf8");
const p = parseBatchSheet(csv, { defaultBuyerPremiumPct: 15 });
const skips = p.rows.filter((r) => {
  const n = +String(r.lot).replace(/\D/g, "");
  return n >= 10 && n <= 231 && r.unresolved;
});
const byLot = new Map(j.results.map((r) => [String(r.lot), r]));
for (const s of skips) {
  byLot.set(String(s.lot), {
    lot: s.lot,
    label: s.rawTitle,
    currentBid: s.currentBid,
    maxBid: null,
    headroom: null,
    verdict: null,
    soldCount: 0,
    soldP25: null,
    soldMedian: null,
    netProfit: null,
    matchNote: "unresolved title",
    error: null,
  });
}
const ranked = [...byLot.values()].sort((a, b) => Number(a.lot) - Number(b.lot));
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
        r.verdict ? r.verdict : r.matchNote === "unresolved title" ? "SKIP" : "no-comps",
        JSON.stringify(r.matchNote ?? ""),
      ].join(","),
    ),
  ].join("\n"),
);
console.log(
  JSON.stringify(
    {
      rows: ranked.length,
      skips: skips.length,
      sample: ["10", "15", "20", "25", "136"].map((lot) => {
        const r = byLot.get(lot);
        return r && {
          lot,
          label: r.label,
          bid: r.currentBid,
          max: r.maxBid,
          v: r.verdict,
          sold: r.soldCount,
          note: r.matchNote,
        };
      }),
    },
    null,
    2,
  ),
);
