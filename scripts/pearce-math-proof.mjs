const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const INBOUND = 0;
const TARGET = 50;
const MIN_MARGIN = 15;
const OUTBOUND = 30;
const LISTING = 3;
const MASTER_FFL = 5;
const CARD_PCT = 0.03;
const AL_TAX = 0.09;

const lots = [
  { lot: 74, gun: "S&W Model 915 9mm", mfr: "Smith & Wesson", model: "Model 915", cal: "9mm", cond: "used", recMax: 225, status: "outbid", bid: 80 },
  { lot: 97, gun: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cond: "used", recMax: 130, status: "outbid", bid: 80 },
  { lot: 135, gun: "Canik Mete MC9", mfr: "Canik", model: "Mete MC9", cal: "9mm", cond: "used", recMax: 125, status: "winning", bid: 90 },
  { lot: 150, gun: "S&W Model 422 22LR", mfr: "Smith & Wesson", model: "422", cal: "22 LR", cond: "used", recMax: 80, status: "winning", bid: 80 },
  { lot: 172, gun: "S&W M&P 40", mfr: "Smith & Wesson", model: "M&P 40", cal: ".40 S&W", cond: "used", recMax: 150, status: "outbid", bid: 60 },
];

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function fvf(G) {
  const capped = Math.min(G, 15000);
  return round2(0.06 * Math.min(capped, 400) + 0.04 * Math.max(0, capped - 400));
}

function allIn(hammer) {
  return round2(hammer * (1 + PREMIUM / 100) + INBOUND);
}

function routeGunbroker(G) {
  const cardFee = round2(CARD_PCT * (G + OUTBOUND));
  return round2(G - fvf(G) - MASTER_FFL - OUTBOUND - cardFee - LISTING);
}

function routeLocal(G) {
  const sellerGross = round2(G / (1 + AL_TAX));
  return sellerGross;
}

function bestNet(G) {
  const gb = routeGunbroker(G);
  const local = routeLocal(G);
  return { gb, local, best: round2(Math.max(gb, local)), route: gb >= local ? "GunBroker" : "Local AL" };
}

function profit(hammer, G) {
  const ai = allIn(hammer);
  const { best } = bestNet(G);
  return round2(best - ai);
}

function maxHammerFromG(G) {
  const { best } = bestNet(G);
  const maxAllIn = Math.min(best - TARGET, best / (1 + MIN_MARGIN / 100));
  return Math.floor(maxAllIn / (1 + PREMIUM / 100));
}

function maxHammerMarginOnly(G) {
  const { best } = bestNet(G);
  const maxAllIn = best / (1 + MIN_MARGIN / 100);
  return Math.floor(maxAllIn / (1 + PREMIUM / 100));
}

for (const l of lots) {
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      manufacturer: l.mfr,
      model: l.model,
      caliber: l.cal,
      category: "handgun",
      condition: l.cond,
      targetAcquisitionCost: l.recMax,
      inboundShip: INBOUND,
      buyerPremiumPct: PREMIUM,
      autoComps: true,
      targetProfit: TARGET,
      minMarginPct: MIN_MARGIN,
      outboundShip: OUTBOUND,
      listingUpgrades: LISTING,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const j = await res.json();
  const sold = j.result?.sold ?? {};
  const asking = j.asking ?? {};

  console.log("\n" + "█".repeat(70));
  console.log(`LOT ${l.lot}: ${l.gun}  [${l.status}]  RECOMMENDED MAX: $${l.recMax}`);
  console.log("█".repeat(70));
  console.log(`GBA: ${j.sourceStatus?.gba ?? "?"}`);
  console.log(
    `SOLD n=${sold.count}:  Low $${sold.low}  P25 $${sold.p25}  Med $${sold.median}  P75 $${sold.p75}  High $${sold.high}`,
  );
  console.log(
    `ASKING n=${asking.count ?? 0}:  P25 $${asking.p25}  Med $${asking.median}  P75 $${asking.p75}`,
  );
  console.log(`Desk API maxBid @ $${l.recMax} cost input: $${j.result?.maxBid}`);
  console.log(`\nIf you WIN at MAX HAMMER $${l.recMax}:`);
  console.log(`  All-in cost = $${l.recMax} × 1.185 = $${allIn(l.recMax)}`);

  const levels = [
    { label: "P25 (worst quartile)", G: sold.p25 },
    { label: "MEDIAN (typical)", G: sold.median },
    { label: "P75 (good day)", G: sold.p75 },
  ];

  console.log("\n  Sell scenario          | List G | Best route  | Net    | PROFIT | OK?");
  console.log("  " + "-".repeat(68));
  let worst = Infinity;
  for (const lv of levels) {
    if (!lv.G) continue;
    const { gb, local, best, route } = bestNet(lv.G);
    const p = profit(l.recMax, lv.G);
    worst = Math.min(worst, p);
    const ok = p >= TARGET ? "GO (+$50)" : p >= 0 ? "BE only" : "LOSS";
    console.log(
      `  ${lv.label.padEnd(22)} | $${String(lv.G).padEnd(5)} | ${route.padEnd(11)} | $${String(best).padEnd(5)} | $${String(p).padEnd(5)} | ${ok}`,
    );
    console.log(`    (GB net $${gb} vs Local net $${local})`);
  }

  console.log(`\n  WORST CASE at max $${l.recMax}: profit $${worst === Infinity ? "?" : worst}`);
  console.log("\n  Max hammer ceilings by sell level ($50 profit target):");
  for (const lv of levels) {
    if (!lv.G) continue;
    const mh = maxHammerFromG(lv.G);
    const mhMargin = maxHammerMarginOnly(lv.G);
    console.log(
      `    ${lv.label}: max $${mh} ($50 profit) | max $${mhMargin} (15% margin only, $0 target)`,
    );
  }

  const safe = worst >= TARGET;
  const be = worst >= 0;
  console.log("\n  VERDICT:");
  if (safe)
    console.log(`    ✅ Max $${l.recMax} is SAFE — even P25 sell still clears +$50`);
  else if (be)
    console.log(
      `    ⚠️  Max $${l.recMax} survives P25 but only BE/thin — consider lowering max`,
    );
  else
    console.log(`    ❌ Max $${l.recMax} LOSES MONEY at P25 — LOWER MAX`);
}

console.log("\n\nContract: 18.5% premium | $0 inbound | $30 outbound | $3 listing | $5 Master FFL");
console.log("Profit = max(GunBroker net, Local net) − all-in hammer×1.185\n");
