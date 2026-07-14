const PREMIUM = 18.5;
const OUTBOUND = 30;
const LISTING = 3;
const MASTER_FFL = 5;
const TARGET = 50;

const lots = [
  { lot: 150, gun: "S&W Model 422 .22 LR", placedMax: 80, current: 80, status: "WINNING", p25: 335, med: 399, p75: 434.5, safeMax: 217 },
  { lot: 135, gun: "Canik Mete MC9", placedMax: 125, current: 90, status: "WINNING", p25: 320, med: 445, p75: 510, safeMax: 205 },
  { lot: 97, gun: "Canik TP9 SF", placedMax: 75, current: 80, status: "OUTBID", p25: 225, med: 243, p75: 276.5, safeMax: 131 },
  { lot: 74, gun: "S&W Model 915", placedMax: 75, current: 80, status: "OUTBID", p25: 301, med: 350, p75: 375, safeMax: 190 },
  { lot: 172, gun: "S&W M&P 40", placedMax: 55, current: 60, status: "OUTBID", p25: 212, med: 255, p75: 305, safeMax: 121 },
  { lot: 308, gun: "Troy AR mag", placedMax: 7, current: 7, status: "WINNING", accessory: true },
  { lot: 344, gun: "(2) Ruger 10/22 mags", placedMax: 15, current: 12, status: "WINNING", accessory: true },
];

function r2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function fvf(G) {
  const c = Math.min(G, 15000);
  return r2(0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400));
}
function allIn(h) {
  return r2(h * 1.185);
}
function netGb(G) {
  return r2(G - fvf(G) - MASTER_FFL - OUTBOUND - 0.03 * (G + OUTBOUND) - LISTING);
}
function netLocal(G) {
  return r2(G / 1.09);
}
function row(hammer, G) {
  const ai = allIn(hammer);
  const gb = netGb(G);
  const loc = netLocal(G);
  const gp = r2(gb - ai);
  const lp = r2(loc - ai);
  const best = Math.max(gp, lp);
  const route = lp >= gp ? "LOCAL" : "GB";
  const tag = best >= TARGET ? "GO" : best >= 0 ? "BE" : "LOSS";
  return { ai, gb, loc, gp, lp, best, route, tag };
}

console.log("PEARCE — YOUR PLACED MAX vs SAFE MAX (you can only RAISE, not lower)\n");
console.log("All-in = hammer × 1.185 (18.5% Pearce premium)\n");

for (const l of lots) {
  console.log("█".repeat(72));
  console.log(`LOT ${l.lot}: ${l.gun}  [${l.status}]`);
  console.log(`Current high bid: $${l.current}  |  YOUR PLACED MAX: $${l.placedMax}`);
  if (l.accessory) {
    console.log(`All-in if win @ $${l.placedMax}: $${allIn(l.placedMax)} — accessory, bundle with guns\n`);
    continue;
  }
  console.log(`Comps (sold): P25 $${l.p25} | Median $${l.med} | P75 $${l.p75}`);
  console.log(`SAFE MAX (+$50 @ P25, local): $${l.safeMax}  — you can RAISE to this\n`);

  if (l.status === "OUTBID" && l.placedMax < l.current) {
    console.log(`  ⚠️  OUTBID: your max $${l.placedMax} < current $${l.current} — you will NOT win unless you RAISE max\n`);
  }

  console.log(`  MATH IF YOU WIN AT YOUR PLACED MAX ($${l.placedMax}):`);
  console.log(`  All-in cost: $${l.placedMax} × 1.185 = $${allIn(l.placedMax)}\n`);
  console.log("  Sell @     | List $ | GB net | GB profit | Local net | Local profit | BEST");
  for (const [label, G] of [
    ["P25", l.p25],
    ["Median", l.med],
    ["P75", l.p75],
  ]) {
    const r = row(l.placedMax, G);
    console.log(
      `  ${label.padEnd(8)} | $${String(G).padEnd(5)} | $${String(r.gb).padEnd(5)} | $${String(r.gp).padEnd(8)} | $${String(r.loc).padEnd(8)} | $${String(r.lp).padEnd(11)} | ${r.route} $${r.best} ${r.tag}`,
    );
  }

  if (l.placedMax < l.safeMax) {
    console.log(`\n  MATH IF YOU RAISE MAX TO SAFE ($${l.safeMax}):`);
    console.log(`  All-in: $${allIn(l.safeMax)}`);
    const p25 = row(l.safeMax, l.p25);
    const med = row(l.safeMax, l.med);
    console.log(`  P25 profit: $${p25.best} (${p25.tag}) | Median profit: $${med.best} (${med.tag})`);
    console.log(`  → RAISE max from $${l.placedMax} to $${l.safeMax}`);
  } else {
    console.log(`\n  ✓ Placed max $${l.placedMax} is within safe ceiling $${l.safeMax}`);
  }
  console.log();
}

console.log("█".repeat(72));
console.log("SUMMARY — WHAT TO DO (can only raise, never lower)\n");
for (const l of lots) {
  const action =
    l.accessory
      ? "KEEP"
      : l.status === "OUTBID" && l.placedMax < l.current
        ? `RAISE $${l.placedMax} → $${l.safeMax}`
        : l.placedMax < l.safeMax && l.status === "WINNING"
          ? `KEEP $${l.placedMax} (OK)`
          : `KEEP $${l.placedMax}`;
  console.log(`  Lot ${String(l.lot).padStart(3)}: placed $${String(l.placedMax).padStart(3)}  safe $${String(l.safeMax ?? l.placedMax).padStart(3)}  →  ${action}`);
}

let winAi = 0;
for (const l of lots.filter((x) => x.status === "WINNING"))
  winAi += allIn(l.placedMax);
console.log(`\nAll-in if all CURRENT WINNERS hold at placed max: ~$${r2(winAi)}`);
