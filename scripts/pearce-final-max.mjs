const PREMIUM = 18.5;
const OUTBOUND = 30;
const LISTING = 3;
const MASTER_FFL = 5;
const PROFIT_TARGET = 50;

const lots = [
  { lot: 150, gun: "S&W Model 422 .22 LR", status: "winning", bid: 80, p25: 335, med: 399, low: 180 },
  { lot: 135, gun: "Canik Mete MC9", status: "winning", bid: 90, p25: 320, med: 445, low: 225 },
  { lot: 97, gun: "Canik TP9 SF", status: "outbid", bid: 80, p25: 225, med: 243, low: 155 },
  { lot: 74, gun: "S&W Model 915", status: "outbid", bid: 80, p25: 301, med: 350, low: 212 },
  { lot: 172, gun: "S&W M&P 40", status: "outbid", bid: 60, p25: 212, med: 255, low: 122 },
  { lot: 308, gun: "Troy AR mag", status: "winning", bid: 7, accessory: true },
  { lot: 344, gun: "(2) Ruger 10/22 mags", status: "winning", bid: 12, accessory: true },
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
function bestNet(G) {
  const gb = r2(G - fvf(G) - MASTER_FFL - OUTBOUND - 0.03 * (G + OUTBOUND) - LISTING);
  const loc = r2(G / 1.09);
  return { gb, loc, best: Math.max(gb, loc), route: gb >= loc ? "GB" : "LOCAL" };
}
function profit(h, G) {
  return r2(bestNet(G).best - allIn(h));
}
function maxHammer(G, minProfit) {
  const { best } = bestNet(G);
  const maxAllIn = best - minProfit;
  return Math.max(0, Math.floor(maxAllIn / 1.185));
}

const DRIVE_HOURS = 2;
const MIN_TRIP_PROFIT = 100; // don't drive 2hr for one thin gun

console.log("MAX BID CALCULATOR — $50 GO vs $0 BREAK-EVEN vs NO-LOSS\n");

const results = [];

for (const l of lots) {
  if (l.accessory) {
    results.push({
      ...l,
      maxGo: l.bid <= 15 ? 15 : 10,
      maxBe: 20,
      maxNoLoss: 15,
      aiGo: allIn(15),
      p25ProfitGo: null,
      medProfitGo: null,
      worthSoloTrip: false,
      note: "Low $ accessory — only worth it bundled with guns",
    });
    continue;
  }

  const maxGo = maxHammer(l.p25, PROFIT_TARGET);
  const maxBe = maxHammer(l.p25, 0);
  const maxNoLoss = maxHammer(l.low, 0);

  const maxEnter = Math.min(maxGo, maxBe); // same for go; use maxGo for $50
  const enterGo = maxGo;
  const enterBe = maxBe;

  const medProfitAtGo = profit(enterGo, l.med);
  const p25ProfitAtGo = profit(enterGo, l.p25);
  const medProfitAtBe = profit(enterBe, l.med);

  const worthSoloTrip = medProfitAtGo >= MIN_TRIP_PROFIT;

  results.push({
    ...l,
    maxGo: enterGo,
    maxBe: enterBe,
    maxNoLoss,
    aiGo: allIn(enterGo),
    p25ProfitGo: p25ProfitAtGo,
    medProfitGo: medProfitAtGo,
    medProfitBe: medProfitAtBe,
    worthSoloTrip,
    sellLocal: l.med,
    sellGb: l.med,
  });
}

console.log("═".repeat(78));
console.log("ENTER THESE MAX BIDS (recommended = $50 profit even on WORST 25% comp, local sell)");
console.log("═".repeat(78));
for (const r of results) {
  console.log(`Lot ${String(r.lot).padStart(3)}  ${r.gun.padEnd(28)}  MAX: $${r.maxGo}`);
}

console.log("\n" + "═".repeat(78));
console.log("DETAIL PER LOT");
console.log("═".repeat(78));

for (const r of results) {
  console.log(`\nLOT ${r.lot} — ${r.gun}  [${r.status}]`);
  if (r.accessory) {
    console.log(`  Enter MAX: $${r.maxGo}  |  Bundle only, not worth 2hr drive alone`);
    continue;
  }
  console.log(`  Comps sold:  P25 $${r.p25}  |  Median $${r.med}  |  Low $${r.low}`);
  console.log(`  MAX for +$50 (sell @ P25, local):  $${r.maxGo}  (all-in $${r.aiGo})`);
  console.log(`  MAX for $0 BE (sell @ P25, local): $${r.maxBe}  — only if building name + trip has 2+ guns`);
  console.log(`  Never lose $ (sell @ comp low):      max $${r.maxNoLoss}`);
  console.log(`  @ MAX $${r.maxGo} → profit P25 $${r.p25ProfitGo} | Median $${r.medProfitGo} (local)`);
  console.log(`  List LOCAL: $${r.med} tax-in  |  GB backup: $${r.med}+ (buyer pays ship)`);
  console.log(`  Worth 2hr drive ALONE? ${r.worthSoloTrip ? "YES" : "NO — need 2+ wins"}`);
}

console.log("\n" + "═".repeat(78));
console.log("TRIP RULE — don't drive 2 hours for one gun");
console.log("═".repeat(78));
console.log("GO SOLO (any one of these wins = worth the trip):");
for (const r of results.filter((x) => x.worthSoloTrip))
  console.log(`  Lot ${r.lot} ${r.gun} — median profit ~$${r.medProfitGo}`);
console.log("\nNEED 2+ GUNS (thin alone — bid max but skip pickup if only one lands):");
for (const r of results.filter((x) => !x.accessory && !x.worthSoloTrip))
  console.log(`  Lot ${r.lot} ${r.gun} — median profit ~$${r.medProfitGo}`);
console.log("\nBEST BUNDLES (pickup makes sense):");
console.log("  A) 150 + 135 + mags        — you're already winning, ~$400+ med profit");
console.log("  B) 150 + 97 + 172          — three guns, mixed margin");
console.log("  C) 74 (915) ONLY if also winning 150 or 135 — not solo");
console.log("  D) Skip trip if ONLY win: 97, 172, or 74 alone");

const goTotal = results.reduce((s, r) => s + r.aiGo, 0);
console.log(`\nTotal all-in @ GO maxes: $${r2(goTotal)}`);

console.log("\n" + "═".repeat(78));
console.log("COPY INTO PEARCE — FINAL");
console.log("═".repeat(78));
for (const r of results) console.log(`  Lot ${r.lot}: $${r.maxGo}`);
