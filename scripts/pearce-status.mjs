const lots = [
  { l: 74, g: "S&W 915", cur: 85, max: 175, p25: 301, med: 350, safe: 190 },
  { l: 97, g: "TP9 SF", cur: 85, max: 125, p25: 225, med: 243, safe: 131 },
  { l: 135, g: "Mete MC9", cur: 90, max: 125, p25: 320, med: 445, safe: 205 },
  { l: 150, g: "S&W 422", cur: 80, max: 80, p25: 335, med: 399, safe: 217 },
  { l: 172, g: "M&P 40", cur: 65, max: 100, p25: 212, med: 255, safe: 121 },
];

function r2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function ai(h) {
  return r2(h * 1.185);
}
function fvf(G) {
  const c = Math.min(G, 15000);
  return r2(0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400));
}
function profit(h, G) {
  const a = ai(h);
  const gb = r2(G - fvf(G) - 5 - 30 - 0.03 * (G + 30) - 3);
  const loc = r2(G / 1.09);
  const best = Math.max(gb, loc);
  const p = r2(best - a);
  const tag = p >= 50 ? "GO" : p >= 0 ? "BE" : "LOSS";
  return { p, tag, route: loc >= gb ? "LOCAL" : "GB" };
}

let totMax = 0,
  totCur = 0;
console.log("WINNING ALL 5 — STATUS CHECK\n");

for (const x of lots) {
  totMax += ai(x.max);
  totCur += ai(x.cur);
  const atMaxP25 = profit(x.max, x.p25);
  const atMaxMed = profit(x.max, x.med);
  const atCurMed = profit(x.cur, x.med);
  const safe = x.max <= x.safe ? "✅ under safe" : "⚠️ above safe";
  console.log(`Lot ${x.l} ${x.g}`);
  console.log(`  Now $${x.cur} → max $${x.max}  (${safe} ceiling $${x.safe})`);
  console.log(`  If win @ MAX $${x.max}: all-in $${ai(x.max)}`);
  console.log(`    P25 sell → +$${atMaxP25.p} ${atMaxP25.tag} | Median → +$${atMaxMed.p} ${atMaxMed.tag} (${atMaxMed.route})`);
  console.log(`  If win @ NOW $${x.cur}: all-in $${ai(x.cur)} → med profit +$${atCurMed.p}\n`);
}

console.log(`Total all-in @ current bids: $${r2(totCur)}`);
console.log(`Total all-in @ placed MAX:   $${r2(totMax)}`);
console.log(`Median profit @ current:     ~$${r2(lots.reduce((s, x) => s + profit(x.cur, x.med).p, 0))}`);
console.log(`Median profit @ max:         ~$${r2(lots.reduce((s, x) => s + profit(x.max, x.med).p, 0))}`);
