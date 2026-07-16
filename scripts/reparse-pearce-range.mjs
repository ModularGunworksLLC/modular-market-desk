import { readFileSync, writeFileSync } from "node:fs";
import { parseBatchSheet } from "../src/lib/batch/parse.ts";

const csv = readFileSync("tmp-pearce-47513.csv", "utf8");
const p = parseBatchSheet(csv, { defaultBuyerPremiumPct: 15 });
const inRange = p.rows.filter((r) => {
  const n = +String(r.lot).replace(/\D/g, "");
  return n >= 10 && n <= 231;
});
const evaluable = inRange.filter((r) => !r.unresolved);
const skip = inRange.filter((r) => r.unresolved);
console.log(
  JSON.stringify(
    {
      inRange: inRange.length,
      evaluable: evaluable.length,
      unresolved: skip.length,
      sampleSkip: skip.slice(0, 12).map((r) => ({ lot: r.lot, title: r.rawTitle.slice(0, 60) })),
      sampleNew: evaluable
        .filter((r) => ["10", "15", "20", "25", "136", "212"].includes(String(r.lot)))
        .map((r) => ({ lot: r.lot, mfr: r.manufacturer, model: r.model, cat: r.category })),
    },
    null,
    2,
  ),
);
writeFileSync(
  "tmp-pearce-10-231-retry-rows.json",
  JSON.stringify(
    evaluable.map((r) => ({
      rowNumber: r.rowNumber,
      lot: r.lot,
      manufacturer: r.manufacturer,
      model: r.model,
      caliber: r.caliber,
      category: r.category,
      upc: r.upc,
      currentBid: r.currentBid,
      buyerPremiumPct: r.buyerPremiumPct ?? 15,
    })),
    null,
    2,
  ),
);
