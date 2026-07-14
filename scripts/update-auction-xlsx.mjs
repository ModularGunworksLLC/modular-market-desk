import XLSX from "xlsx";

const src = "C:/Users/micha/OneDrive/Desktop/auction_inventory..xlsx";
const path =
  process.argv[2] ??
  "C:/Users/micha/OneDrive/Desktop/auction_inventory_updated.xlsx";

/** Desk values: 18.5% premium, $0 pickup, $50 target, P25 anchor */
const UPDATES = {
  96: {
    currentBid: 30,
    maxHammer: 204,
    p25: 320,
    median: 360,
    allIn: 241.74,
    profitP25: 51.06,
    profitMedian: 88.66,
    notes: "GO at bid. Max $204 walk-away. ~$51 profit @ P25 / ~$89 @ median if sold at max.",
  },
  135: {
    currentBid: 70,
    maxHammer: 204,
    p25: 320,
    median: 445,
    allIn: 241.74,
    profitP25: 51.06,
    profitMedian: 169.46,
    notes: "GO at bid. Best upside at median. Max $204 walk-away.",
  },
  95: {
    currentBid: 40,
    maxHammer: 129,
    p25: 225,
    median: 243,
    allIn: 152.87,
    profitP25: 50.63,
    profitMedian: 67.55,
    notes: "GO at bid. Max $129 walk-away.",
  },
  97: {
    currentBid: 55,
    maxHammer: 129,
    p25: 225,
    median: 243,
    allIn: 152.87,
    profitP25: 50.63,
    profitMedian: 67.55,
    notes: "GO at bid. Same comps as Lot 95. Max $129 walk-away.",
  },
  19: {
    currentBid: 225,
    maxHammer: 263,
    p25: 394,
    median: 405.5,
    allIn: 311.66,
    profitP25: 50.7,
    profitMedian: 61.62,
    notes: "GO at bid. Can rebid to $263 max. PX4 Storm 9mm comps.",
  },
  94: {
    currentBid: 175,
    maxHammer: 165,
    p25: 270,
    median: 300,
    allIn: 195.53,
    profitP25: 50.27,
    profitMedian: 78.47,
    notes: "OUTBID at $175 — over walk-away. Do not rebid above $165.",
  },
  82: {
    currentBid: 65,
    maxHammer: 80,
    p25: 163.5,
    median: 185,
    allIn: 94.8,
    profitP25: 50.89,
    profitMedian: 71.1,
    notes: "GO but TIGHT. Hard stop $80 max hammer. Only ~$15 headroom.",
  },
};

const wb = XLSX.readFile(src);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

const extraCols = [
  "All-in @ Max (18.5%)",
  "Profit @ P25 (at max bid)",
  "Profit @ Median (at max bid)",
];

let updated = 0;
for (const row of rows) {
  const lot = Number(row.Lot);
  const u = UPDATES[lot];
  if (!u) continue;

  row[" Current Bid "] = u.currentBid;
  row[" Max Hammer Bid "] = u.maxHammer;
  row[" GunBroker Est Value Min "] = u.p25;
  row[" GunBroker Est Value Max "] = u.median;
  row["Margin Notes"] = u.notes;
  row[extraCols[0]] = u.allIn;
  row[extraCols[1]] = Math.round(u.profitP25 * 100) / 100;
  row[extraCols[2]] = Math.round(u.profitMedian * 100) / 100;

  if (lot === 19 && String(row["Item Description"]).includes("Pmm")) {
    row["Item Description"] = "Beretta PX4 Storm 9x19 Pistol";
  }

  updated++;
}

// Ensure header order: original cols + new cols
const baseHeaders = [
  "Lot",
  "Category",
  "Item Description",
  "Serial Number",
  " Current Bid ",
  " Max Hammer Bid ",
  " GunBroker Est Value Min ",
  " GunBroker Est Value Max ",
  ...extraCols,
  "Margin Notes",
];

const newWs = XLSX.utils.json_to_sheet(rows, { header: baseHeaders });
wb.Sheets[sheetName] = newWs;
XLSX.writeFile(wb, path);

console.log(`Updated ${updated} lots in ${path}`);
for (const lot of Object.keys(UPDATES)) {
  const r = rows.find((x) => Number(x.Lot) === Number(lot));
  console.log(
    `Lot ${lot}: bid $${r[" Current Bid "]}, max $${r[" Max Hammer Bid "]}, P25 $${r[" GunBroker Est Value Min "]}, median $${r[" GunBroker Est Value Max "]}`,
  );
}
