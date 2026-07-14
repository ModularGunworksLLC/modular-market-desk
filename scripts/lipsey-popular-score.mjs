import fs from "fs";
import { parse } from "csv-parse/sync";

const CSV =
  process.argv[2] ??
  "C:/Users/micha/Downloads/Lipsey's-Catalog-05-06-2026,_13-12-19.csv";

const POPULAR_SKUS = `
BEJ20X22R8 KM3000500 HK81001074 BEJAXA1F921TAC TAGX29B5 HERR22B6PG GLPV1759203
BEJAXN9258A1 SI320F9BSSPTAC CAHG7069-N SI226X59CLASSIC CAHG6595-N KM3700812
RUK1022RB-BRBZ CARI3291-N KM3600004 RULCP-PG HERR22B4PG RULCC57X28
CAHG6595OSV-N CAHG5637OSV-N KM3300258 TAG39BB17 CAHG5610B-N HEH92357189 SM13617
RUSR22PB KM3600302 TAGX49BBR4MAG KM3300244 BEJAXN9208A1 SI320XCA9TCTACP
RURUGER-57-GOLD WI521101102 BEJ92F300M RUWRG-4FBLKBRH BEJAXN9278A1 TAG2SB
SI320C9BSSPTAC KM3600007 GLPV4559203 CZ91247 SI320C9BSSMS
`.trim().split(/\s+/);

const GB = [
  [/SI320C9BSSMS|320C-9-BSS/i, 489, 40, "P320 Compact NSS"],
  [/SI320C9BSSPTAC/i, 499, 40, "P320C TACPRO"],
  [/SI320F9BSSPTAC/i, 499, 40, "P320F TACPRO"],
  [/SM13617|13617/i, 649, 40, "M&P9 LE"],
  [/TAGX29B5|GX2931-5X13/i, 349, 40, "GX2 5-mag"],
  [/CAHG6595OSV|CAHG5637OSV/i, 399, 40, "Canik METE ONE+optic"],
  [/CAHG6595-N|CAHG7069/i, 399, 40, "Canik METE SFT"],
  [/CAHG5610B/i, 379, 40, "Canik TP9 Elite SC"],
  [/TAG39BB17/i, 299, 40, "Taurus G3"],
  [/TAG2SB/i, 279, 40, "Taurus G2S"],
  [/BEJAXA1F921TAC/i, 499, 40, "Beretta APX A1 Tac"],
  [/BEJAXN92/i, 379, 40, "Beretta APX Carry"],
  [/BEJ92F300M/i, 649, 40, "Beretta 92FS"],
  [/BEJ20X22R8/i, 349, 40, "Beretta Bobcat"],
  [/KM3300258/i, 579, 40, "Kimber Micro RTC"],
  [/RULCC57X28|19300/i, 650, 60, "LC Carbine 5.7"],
  [/RULCP-PG/i, 279, 40, "LCP Lilac TALO"],
  [/GLPV1759203|GLPV4559203/i, 649, 40, "Glock TALO V"],
  [/RURUGER-57-GOLD/i, 549, 40, "Ruger-57 Gold TALO"],
  [/RUSR22PB/i, 449, 40, "Ruger SR22"],
  [/RUWRG-4F/i, 249, 40, "Wrangler+holo"],
  [/HERR22B/i, 199, 40, "Heritage RR"],
  [/WI521101102/i, 249, 60, "Wildcat SR"],
  [/HEH92357189/i, 579, 60, "Heritage 92 carbine"],
];

function fvf(G) {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}
function profitBuyer(list, cost) {
  return Math.round((list - fvf(list) - 8 - cost) * 100) / 100;
}
function profitYou(list, cost, ship) {
  const card = 0.03 * (list + ship);
  return Math.round((list - fvf(list) - 5 - ship - card - 3 - cost) * 100) / 100;
}

const rows = parse(fs.readFileSync(CSV, "utf8"), {
  columns: true,
  skip_empty_lines: true,
});
const bySku = new Map(rows.map((r) => [r.ITEMNO, r]));

const guns = [];
for (const sku of POPULAR_SKUS) {
  const r = bySku.get(sku);
  if (!r) {
    console.log("MISSING from CSV:", sku);
    continue;
  }
  if (!/pistol|revolver|rifle/i.test(`${r.TYPE} ${r.ITEMTYPE}`)) continue;

  const dealer = parseFloat(r.CURRENTPRICE ?? r.PRICE);
  const cost = dealer + 15;
  const join = [r.ITEMNO, r.MODEL, r.DESCRIPTION1, r.MANUFACTURERMODELNO].join(" ");
  const hit = GB.find(([re]) => re.test(join));
  if (!hit) continue;

  const [, floor, ship, tag] = hit;
  const list = floor - 40;
  guns.push({
    sku,
    tag,
    dealer,
    msrp: parseFloat(r.MSRP),
    qty: r.QUANTITY,
    cost,
    list,
    pb: profitBuyer(list, cost),
    py: profitYou(list, cost, ship),
    desc: (r.DESCRIPTION1 ?? "").slice(0, 50),
  });
}

guns.sort((a, b) => b.pb - a.pb);

console.log("\n=== YOUR POPULAR/SALE FIREARMS — FLIP SCORE ===\n");
console.log("list = GB floor − $40 | buyer pays ship\n");
for (const g of guns) {
  const verdict =
    g.pb >= 50 ? "GO" : g.pb >= 25 ? "MAYBE" : g.py >= 0 ? "BREAK-EVEN" : "PASS";
  console.log(
    `${verdict.padEnd(12)} ${g.sku} | $${g.dealer} dealer | list $${g.list} | buyer +$${g.pb} / you-ship +$${g.py} | ${g.qty} qty`,
  );
  console.log(`             ${g.desc}`);
}
