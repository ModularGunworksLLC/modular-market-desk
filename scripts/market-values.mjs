const DESK = "https://desk.modulargunworks.com";

const lots = [
  { lot: 96, gun: "Canik TP9 SFX", mfr: "Canik", model: "TP9 SFX", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 135, gun: "Canik Mete MC9", mfr: "Canik", model: "Mete MC9", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 95, gun: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 97, gun: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 19, gun: "Beretta PX4 Storm", mfr: "Beretta", model: "PX4 Storm", cal: "9mm", cat: "handgun", cond: "used" },
  { lot: 94, gun: "S&W M&P 45", mfr: "Smith & Wesson", model: "M&P45", cal: ".45 ACP", cat: "handgun", cond: "used" },
  { lot: 82, gun: "Taurus GX4", mfr: "Taurus", model: "GX4", cal: "9mm", cat: "handgun", cond: "used" },
];

async function market(gun) {
  const body = {
    manufacturer: gun.mfr,
    model: gun.model,
    caliber: gun.cal,
    category: gun.cat,
    condition: gun.cond,
    targetAcquisitionCost: 1,
    autoComps: true,
    targetProfit: 50,
    buyerPremiumPct: 18.5,
    inboundShip: 0,
  };
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  const r = j.result ?? j;
  const sold = r.sold ?? {};
  const asking = r.asking ?? {};
  const scenarios = r.scenarios ?? [];
  return {
    lot: gun.lot,
    gun: gun.gun,
    soldCount: sold.count ?? 0,
    soldLow: sold.low,
    p25: sold.p25,
    median: sold.median,
    p75: sold.p75,
    soldHigh: sold.high,
    soldAvg: sold.avg,
    askingCount: asking.count ?? 0,
    askingLow: asking.low,
    askingMedian: asking.median,
    askingHigh: asking.high,
    gba: j.sourceStatus?.gba,
    scenarios: scenarios.map((s) => ({ label: s.label, sellPrice: s.sellPrice ?? s.gross })),
  };
}

const rows = [];
for (const lot of lots) {
  rows.push(await market(lot));
}
console.log(JSON.stringify(rows, null, 2));
