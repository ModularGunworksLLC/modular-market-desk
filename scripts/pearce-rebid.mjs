const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const INBOUND = 0;
const TARGET = 50;
const MIN_MARGIN = 15;

const lots = [
  { lot: 74, gun: "S&W Model 915 9mm", mfr: "Smith & Wesson", model: "Model 915", cal: "9mm", cat: "handgun", cond: "used", bid: 80, yourMax: 75, status: "outbid" },
  { lot: 97, gun: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun", cond: "used", bid: 80, yourMax: 75, status: "outbid" },
  { lot: 135, gun: "Canik Mete MC9", mfr: "Canik", model: "Mete MC9", cal: "9mm", cat: "handgun", cond: "used", bid: 90, yourMax: 125, status: "winning" },
  { lot: 150, gun: "S&W Model 422 22LR", mfr: "Smith & Wesson", model: "422", cal: "22 LR", cat: "handgun", cond: "used", bid: 80, yourMax: 80, status: "winning" },
  { lot: 172, gun: "S&W M&P 40", mfr: "Smith & Wesson", model: "M&P 40", cal: ".40 S&W", cat: "handgun", cond: "used", bid: 60, yourMax: 55, status: "outbid" },
];

function fvf(G) {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}

function allIn(hammer, premium = PREMIUM, inbound = INBOUND) {
  return Math.round((hammer * (1 + premium / 100) + inbound) * 100) / 100;
}

function bestNetAtG(G, outboundShip = 30) {
  const netGb = G - fvf(G) - 5 - outboundShip - 0.03 * (G + outboundShip) - 3;
  const netLocal = G / 1.09;
  return Math.round(Math.max(netGb, netLocal) * 100) / 100;
}

function maxHammerForTarget(bestNet, target = TARGET, minMargin = MIN_MARGIN) {
  const maxAllIn = Math.min(bestNet - target, bestNet / (1 + minMargin / 100));
  return Math.max(0, Math.floor(maxAllIn / (1 + PREMIUM / 100)));
}

function profitAtHammer(hammer, G) {
  const net = bestNetAtG(G);
  return Math.round((net - allIn(hammer)) * 100) / 100;
}

for (const l of lots) {
  const body = {
    manufacturer: l.mfr,
    model: l.model,
    caliber: l.cal,
    category: l.cat,
    condition: l.cond,
    targetAcquisitionCost: l.bid,
    inboundShip: INBOUND,
    buyerPremiumPct: PREMIUM,
    autoComps: true,
    targetProfit: TARGET,
    minMarginPct: MIN_MARGIN,
    outboundShip: 30,
    listingUpgrades: 3,
  };

  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const j = await res.json();
  const r = j.result;
  const sold = r?.sold ?? {};
  const asking = j.asking ?? {};

  const scenarios = ["p25", "median", "p75"].map((k) => ({
    label: k.toUpperCase(),
    G: sold[k] ?? 0,
    net: bestNetAtG(sold[k] ?? 0),
    profitNow: profitAtHammer(l.bid, sold[k] ?? 0),
    maxHammer: maxHammerForTarget(bestNetAtG(sold[k] ?? 0)),
  }));

  const deskMax = r?.maxBid ?? 0;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`LOT ${l.lot}: ${l.gun} [${l.status.toUpperCase()}]`);
  console.log(`Current bid: $${l.bid} | Your max: $${l.yourMax} | All-in @ bid: $${allIn(l.bid)}`);
  console.log(`GBA: ${j.sourceStatus?.gba ?? j.error ?? "?"}`);
  console.log(`SOLD (${sold.count}): P25 $${sold.p25} | Med $${sold.median} | P75 $${sold.p75}`);
  console.log(`ASKING (${asking.count ?? 0}): P25 $${asking.p25} | Med $${asking.median} | P75 $${asking.p75}`);
  console.log(`Desk max bid (median scenario): $${deskMax}`);
  console.log("Profit / max hammer by sell scenario ($50 target, 18.5% premium):");
  for (const s of scenarios) {
    if (!s.G) continue;
    const tag =
      s.profitNow >= TARGET ? "GO" : s.profitNow >= 0 ? "BE" : "PASS";
    console.log(
      `  ${s.label} @$${s.G}: profit@$${l.bid}=$${s.profitNow} (${tag}) | MAX HAMMER=$${s.maxHammer}`,
    );
  }

  const med = scenarios.find((s) => s.label === "MEDIAN");
  const rec = med ? med.maxHammer : deskMax;
  const nextBid = l.bid + 5;
  const safeMax = Math.min(rec, med?.maxHammer ?? rec);
  let action = "HOLD";
  if (l.status === "outbid") {
    if (nextBid <= safeMax) action = `REBID up to $${safeMax} (next bid $${nextBid})`;
    else action = `WALK — max profitable ~$${safeMax}, current $${l.bid}`;
  } else {
    if (l.yourMax > safeMax)
      action = `TRIM MAX to $${safeMax} — you're high bidder but max $${l.yourMax} > profitable ceiling`;
    else if (med && profitAtHammer(l.bid, med.G) >= TARGET)
      action = `HOLD @ $${l.yourMax} — GO at median`;
    else if (med && profitAtHammer(l.bid, med.G) >= 0)
      action = `HOLD — thin BE at median; consider not raising`;
    else action = `CAUTION — winning but PASS at median comps`;
  }
  console.log(`→ ${action}`);
}

console.log("\n\nMAGS (308 Troy $7, 344 Ruger 10/22 $12): skip deep eval — accessory flip only, hold/low max.\n");
