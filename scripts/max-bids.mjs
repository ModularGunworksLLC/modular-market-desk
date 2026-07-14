const DESK = "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const TARGET = 50;

const lots = [
  { lot: 19, name: "Beretta PX4 Storm 9mm", mfr: "Beretta", model: "PX4 Storm", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 82, name: "Taurus GX4 9mm", mfr: "Taurus", model: "GX4", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 94, name: "S&W M&P 45", mfr: "Smith & Wesson", model: "M&P45", cal: ".45 ACP", cat: "handgun", cond: "used" },
  { lot: 95, name: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 96, name: "Canik TP9 SFX", mfr: "Canik", model: "TP9 SFX", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 97, name: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 135, name: "Canik Mete MC9", mfr: "Canik", model: "Mete MC9", cal: "9mm", cat: "handgun", cond: "used" },
];

async function ceiling(gun) {
  // Evaluate at a nominal hammer; maxBid is independent of current bid
  const body = {
    manufacturer: gun.mfr,
    model: gun.model,
    caliber: gun.cal,
    category: gun.cat,
    condition: gun.cond,
    targetAcquisitionCost: 100,
    autoComps: true,
    targetProfit: TARGET,
    buyerPremiumPct: PREMIUM,
    inboundShip: 0,
  };
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  const r = j.result ?? j;
  const p25 = r.scenarios?.find((s) => s.label === "P25") ?? r;
  return {
    p25Sold: r.sold?.p25,
    soldCount: r.sold?.count,
    maxHammer: p25.maxBid,
    profitAtMax: p25.netProfit,
    gba: j.sourceStatus?.gba,
  };
}

for (const lot of lots) {
  const c = await ceiling(lot);
  const safe = c.maxHammer != null ? Math.floor(c.maxHammer) : null;
  console.log(JSON.stringify({ lot: lot.lot, name: lot.name, ...c, safeMaxBid: safe }));
}
