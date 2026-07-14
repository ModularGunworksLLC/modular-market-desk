const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const INBOUND = 0;
const TARGET = 50;
const OUTBOUND = 30;
const LISTING = 3;
const MASTER_FFL = 5;

const lots = [
  { lot: 150, gun: "S&W Model 422 .22 LR", mfr: "Smith & Wesson", model: "422", cal: "22 LR", max: 80, action: "HOLD" },
  { lot: 135, gun: "Canik Mete MC9", mfr: "Canik", model: "Mete MC9", cal: "9mm", max: 125, action: "HOLD" },
  { lot: 97, gun: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", max: 130, action: "REBID" },
  { lot: 74, gun: "S&W Model 915", mfr: "Smith & Wesson", model: "Model 915", cal: "9mm", max: 190, action: "REBID" },
  { lot: 172, gun: "S&W M&P 40", mfr: "Smith & Wesson", model: "M&P 40", cal: ".40 S&W", max: 121, action: "REBID" },
  { lot: 308, gun: "Troy AR mag", skip: true, max: 10, action: "HOLD" },
  { lot: 344, gun: "(2) Ruger 10/22 mags", skip: true, max: 15, action: "HOLD" },
];

function r2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function fvf(G) {
  const c = Math.min(G, 15000);
  return r2(0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400));
}
function allIn(h) {
  return r2(h * (1 + PREMIUM / 100) + INBOUND);
}
function netGb(G) {
  return r2(G - fvf(G) - MASTER_FFL - OUTBOUND - 0.03 * (G + OUTBOUND) - LISTING);
}
function netLocal(G) {
  return r2(G / 1.09);
}
function listForProfit(ai, netFn, target = TARGET) {
  // binary search list G where netFn(G) - ai >= target
  let lo = ai,
    hi = 5000;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (netFn(mid) - ai >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const rows = [];

for (const l of lots) {
  if (l.skip) {
    rows.push({ ...l, ai: allIn(l.max), note: "Accessory — hold max, skip deep comps" });
    continue;
  }
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      manufacturer: l.mfr,
      model: l.model,
      caliber: l.cal,
      category: "handgun",
      condition: "used",
      targetAcquisitionCost: l.max,
      inboundShip: INBOUND,
      buyerPremiumPct: PREMIUM,
      autoComps: true,
      targetProfit: TARGET,
      outboundShip: OUTBOUND,
      listingUpgrades: LISTING,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const j = await res.json();
  const s = j.result?.sold ?? {};
  const ai = allIn(l.max);

  const scenarios = ["p25", "median", "p75"].map((k) => {
    const G = s[k] ?? 0;
    const gb = netGb(G);
    const loc = netLocal(G);
    const best = Math.max(gb, loc);
    const route = gb >= loc ? "GB" : "LOCAL";
    return {
      label: k.toUpperCase(),
      G,
      gb,
      loc,
      gbProfit: r2(gb - ai),
      locProfit: r2(loc - ai),
      bestProfit: r2(best - ai),
      route,
    };
  });

  const medG = s.median ?? 0;
  const listGb = listForProfit(ai, netGb);
  const listLocal = listForProfit(ai, netLocal);

  rows.push({
    ...l,
    ai,
    sold: s,
    gba: j.sourceStatus?.gba,
    scenarios,
    listGb,
    listLocal,
    worstP25: scenarios[0],
  });
}

console.log("PEARCE SUMMER AUCTION — WALK-AWAY MAX BID SHEET");
console.log("Premium 18.5% | $0 inbound | $50 profit target | 6/12/2026 7pm\n");

for (const r of rows) {
  console.log("═".repeat(72));
  console.log(`LOT ${r.lot}: ${r.gun}`);
  console.log(`ACTION: ${r.action}  →  SET MAX BID: $${r.max}  (all-in $${r.ai})`);
  if (r.skip) {
    console.log(`  ${r.note}\n`);
    continue;
  }
  console.log(`COMPS: ${r.gba}`);
  console.log(`  Sold: P25 $${r.sold.p25} | Med $${r.sold.median} | P75 $${r.sold.p75} (${r.sold.count} comps)\n`);

  console.log("  IF YOU WIN AT MAX — profit by exit channel:");
  console.log("  Scenario   | Comp $ | GB net | GB profit | Local net | Local profit | BEST");
  for (const sc of r.scenarios) {
    const mark = sc.bestProfit >= TARGET ? "✓" : sc.bestProfit >= 0 ? "~" : "✗";
    console.log(
      `  ${sc.label.padEnd(10)} | $${String(sc.G).padEnd(5)} | $${String(sc.gb).padEnd(5)} | $${String(sc.gbProfit).padEnd(8)} | $${String(sc.loc).padEnd(8)} | $${String(sc.locProfit).padEnd(11)} | ${sc.route} $${sc.bestProfit} ${mark}`,
    );
  }

  const w = r.worstP25;
  console.log(`\n  WORST QUARTILE (P25): GB $${w.gbProfit} vs LOCAL $${w.locProfit} → prefer ${w.route}`);
  console.log(`  MIN LIST for +$50 profit:`);
  console.log(`    GunBroker BIN (buyer pays ship):  $${r.listGb}`);
  console.log(`    Local AL (tax-in F2F):            $${r.listLocal}`);
  console.log(`  SUGGESTED LIST @ median comp $${r.sold.median}:`);
  const med = r.scenarios.find((x) => x.label === "MEDIAN");
  console.log(`    GB $${r.sold.median} → profit $${med.gbProfit} | Local $${r.sold.median} → profit $${med.locProfit} → list via ${med.route}\n`);
}

let totalAi = 0;
for (const r of rows) totalAi += r.ai;
console.log("═".repeat(72));
console.log(`TOTAL ALL-IN if every max hits: $${r2(totalAi)}`);
console.log("\nCOPY TO PEARCE (max bids):");
for (const r of rows) console.log(`  Lot ${r.lot}: $${r.max}`);
