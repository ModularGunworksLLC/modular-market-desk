const PREMIUM = 18.5;
const OUTBOUND = 30;
const LISTING = 3;
const MASTER_FFL = 5;
const TARGET = 50;

const lots = [
  { lot: 150, gun: "S&W Model 422 .22 LR", max: 80, action: "HOLD", p25: 335, med: 399, p75: 434.5, n: 99 },
  { lot: 135, gun: "Canik Mete MC9", max: 125, action: "HOLD", p25: 320, med: 445, p75: 510, n: 81 },
  { lot: 97, gun: "Canik TP9 SF", max: 130, action: "REBID", p25: 225, med: 243, p75: 276.5, n: 88 },
  { lot: 74, gun: "S&W Model 915", max: 190, action: "REBID", p25: 301, med: 350, p75: 375, n: 53 },
  { lot: 172, gun: "S&W M&P 40", max: 121, action: "REBID", p25: 212, med: 255, p75: 305, n: 166 },
  { lot: 308, gun: "Troy AR mag", max: 10, action: "HOLD", skip: true },
  { lot: 344, gun: "(2) Ruger 10/22 mags", max: 15, action: "HOLD", skip: true },
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
function minList(netFn, ai, target) {
  for (let G = Math.ceil(ai); G <= 5000; G++) {
    if (netFn(G) - ai >= target) return G;
  }
  return "?";
}

let total = 0;
console.log("PEARCE WALK-AWAY SHEET — set these max bids and walk away\n");

for (const l of lots) {
  const ai = allIn(l.max);
  total += ai;
  console.log(`LOT ${l.lot}  ${l.gun}`);
  console.log(`  MAX BID: $${l.max}   (${l.action})   All-in: $${ai}`);
  if (l.skip) {
    console.log("  (accessory — hold, low $)\n");
    continue;
  }
  console.log(`  Comps (${l.n} sold): P25 $${l.p25} | Med $${l.med} | P75 $${l.p75}`);
  console.log("  Profit if you win at MAX:");
  console.log("              |  GB profit  | Local profit | USE");
  for (const [label, G] of [
    ["P25 worst ", l.p25],
    ["Median    ", l.med],
    ["P75 best  ", l.p75],
  ]) {
    const gp = r2(netGb(G) - ai);
    const lp = r2(netLocal(G) - ai);
    const use = lp > gp ? "LOCAL" : "GB";
    const ok = Math.max(gp, lp) >= TARGET ? "GO" : Math.max(gp, lp) >= 0 ? "BE" : "LOSS";
    console.log(
      `  ${label} @$${G} | $${String(gp).padStart(7)} | $${String(lp).padStart(10)} | ${use.padEnd(5)} ${ok}`,
    );
  }
  const minGb = minList(netGb, ai, TARGET);
  const minLoc = minList(netLocal, ai, TARGET);
  const medGp = r2(netGb(l.med) - ai);
  const medLp = r2(netLocal(l.med) - ai);
  console.log(`  Min list for +$50:  GB $${minGb}  |  Local $${minLoc} (tax-in)`);
  console.log(`  @ median comp: list LOCAL $${l.med} → +$${medLp}  |  GB $${l.med} → +$${medGp}\n`);
}

console.log(`TOTAL all-in if all max bids win: $${r2(total)}\n`);
console.log("ENTER IN PEARCE:");
for (const l of lots) console.log(`  Lot ${String(l.lot).padStart(3)}: $${l.max}`);
