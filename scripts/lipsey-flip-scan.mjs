/**
 * Scan Lipsey catalog CSV for sale/popular flip candidates.
 * Usage: node scripts/lipsey-flip-scan.mjs [path-to-csv]
 */
import fs from "fs";
import { parse } from "csv-parse/sync";

const CSV =
  process.argv[2] ??
  "C:/Users/micha/Downloads/Lipsey's-Catalog-05-06-2026,_13-12-19.csv";

const rows = parse(fs.readFileSync(CSV, "utf8"), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const isHandgun = (r) =>
  /firearm/i.test(r.ITEMTYPE ?? "") &&
  /pistol|revolver/i.test(r.TYPE ?? "");

const dealer = (r) => parseFloat(r.CURRENTPRICE ?? r.PRICE ?? 0);
const msrp = (r) => parseFloat(r.MSRP ?? 0);
const discPct = (r) => {
  const p = dealer(r);
  const m = msrp(r);
  return m > 0 ? ((m - p) / m) * 100 : 0;
};

/** Rough GB floor estimates for velocity-lane handguns (buyer pays ship profit calc) */
const GB_FLOOR = [
  { match: (r) => /320C-9-BSS|320C9BSS/i.test(join(r)), floor: 489, ship: 40 },
  { match: (r) => /M18/i.test(join(r)), floor: 649, ship: 40 },
  { match: (r) => /VP9A1|8100121/i.test(join(r)), floor: 879, ship: 40 },
  { match: (r) => /1911/i.test(join(r)) && /savage/i.test(r.MANUFACTURER ?? ""), floor: 1099, ship: 40 },
  { match: (r) => /G19|GLOCK.*19/i.test(join(r)), floor: 549, ship: 40 },
  { match: (r) => /CANIK.*TP9|TP9SF/i.test(join(r)), floor: 349, ship: 40 },
  { match: (r) => /METE|MC9/i.test(join(r)), floor: 399, ship: 40 },
  { match: (r) => /SHIELD/i.test(join(r)), floor: 399, ship: 40 },
];

function join(r) {
  return [r.ITEMNO, r.MODEL, r.MANUFACTURERMODELNO, r.DESCRIPTION1, r.MANUFACTURER].join(" ");
}

function fvf(G) {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}

function profitBuyer(list, cost) {
  return Math.round((list - fvf(list) - 8 - cost) * 100) / 100;
}

function profitYou(list, cost, ship) {
  const card = 0.03 * (list + ship);
  const net = list - fvf(list) - 5 - ship - card - 3;
  return Math.round((net - cost) * 100) / 100;
}

function scoreRow(r) {
  const cost = dealer(r) + 15;
  const hit = GB_FLOOR.find((g) => g.match(r));
  if (!hit) return null;
  const list = hit.floor - 40;
  const pb = profitBuyer(list, cost);
  const py = profitYou(list, cost, hit.ship);
  if (pb < 25 && py < 0) return null;
  return { cost, list, pb, py, floor: hit.floor, disc: discPct(r) };
}

const onSale = rows.filter((r) => {
  const p = dealer(r);
  if (!p) return false;
  const flagged = (r.ONSALE ?? "").toUpperCase() === "TRUE";
  const was = parseFloat(r.PRICE ?? p);
  return flagged || was > p + 0.01;
});

const handguns = rows.filter(isHandgun);
const saleHandguns = onSale.filter(isHandgun);
const velocity = handguns.filter((r) => {
  const p = dealer(r);
  return p >= 200 && p <= 500;
});

console.log(`Catalog: ${rows.length} rows | handguns: ${handguns.length}`);
console.log(`On sale (all): ${onSale.length} | on sale handguns: ${saleHandguns.length}`);
console.log(`Velocity lane ($200–500): ${velocity.length}\n`);

console.log("=== SCORED FLIP CANDIDATES (known GB floors, list = floor − $40) ===\n");
const scored = [];
for (const r of [...saleHandguns, ...velocity]) {
  const s = scoreRow(r);
  if (s) scored.push({ r, ...s });
}
scored.sort((a, b) => b.pb - a.pb);
for (const x of scored.slice(0, 20)) {
  const r = x.r;
  console.log(
    [
      r.ITEMNO,
      r.MANUFACTURER,
      (r.MODEL ?? "").slice(0, 24),
      `$${dealer(r)}`,
      `MSRP $${msrp(r)}`,
      `-${x.disc.toFixed(0)}%`,
      `list ~$${x.list}`,
      `profit buyer $${x.pb}`,
      `profit you-ship $${x.py}`,
      (r.ONSALE ?? "") === "TRUE" ? "SALE" : "",
      `${r.QUANTITY} qty`,
    ].join(" | "),
  );
  console.log(`  ${(r.DESCRIPTION1 ?? "").slice(0, 70)}`);
}

console.log("\n=== TOP 15 HANDGUN SALES BY % OFF MSRP (needs manual GB check) ===\n");
saleHandguns
  .sort((a, b) => discPct(b) - discPct(a))
  .slice(0, 15)
  .forEach((r) => {
    console.log(
      `${r.ITEMNO} | ${r.MANUFACTURER} ${r.MODEL} | $${dealer(r)} | MSRP $${msrp(r)} | -${discPct(r).toFixed(0)}% | ${r.QUANTITY} qty`,
    );
    console.log(`  ${(r.DESCRIPTION1 ?? "").slice(0, 65)}`);
  });

console.log("\n=== SIG P320 @ dealer <= $400 ===\n");
rows
  .filter(
    (r) =>
      isHandgun(r) &&
      /sig/i.test(r.MANUFACTURER ?? "") &&
      /p320/i.test(join(r)) &&
      dealer(r) <= 400,
  )
  .sort((a, b) => dealer(a) - dealer(b))
  .forEach((r) => {
    const s = scoreRow(r);
    console.log(
      `${r.ITEMNO} | $${dealer(r)} | MSRP $${msrp(r)} | ${r.MODEL} | buyer profit @489-40: ${s ? "$" + s.pb : "n/a"}`,
    );
  });
