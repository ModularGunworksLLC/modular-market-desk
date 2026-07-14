const DESK = "https://desk.modulargunworks.com";

const lots = [
  { lot: 96, gun: "Canik TP9 SFX", mfr: "Canik", model: "TP9 SFX", cal: "9mm", max: 204 },
  { lot: 135, gun: "Canik Mete MC9", mfr: "Canik", model: "Mete MC9", cal: "9mm", max: 204 },
  { lot: 95, gun: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", max: 129 },
  { lot: 97, gun: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", max: 129 },
  { lot: 19, gun: "Beretta PX4 Storm", mfr: "Beretta", model: "PX4 Storm", cal: "9mm", max: 263 },
  { lot: 94, gun: "S&W M&P 45", mfr: "Smith & Wesson", model: "M&P45", cal: ".45 ACP", max: 165 },
  { lot: 82, gun: "Taurus GX4", mfr: "Taurus", model: "GX4", cal: "9mm", max: 80 },
];

async function profitAtHammer(lot, hammer) {
  const body = {
    manufacturer: lot.mfr,
    model: lot.model,
    caliber: lot.cal,
    category: "handgun",
    condition: "used",
    targetAcquisitionCost: hammer,
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
  const p25 = r.scenarios?.find((s) => s.label === "P25");
  const med = r.scenarios?.find((s) => s.label === "Median");
  return {
    lot: lot.lot,
    gun: lot.gun,
    p25: sold.p25,
    median: sold.median,
    maxBid: lot.max,
    allIn: Math.round(hammer * 1.185 * 100) / 100,
    profitP25: p25?.netProfit,
    profitMedian: med?.netProfit,
    marginP25: p25?.marginPct,
  };
}

for (const lot of lots) {
  console.log(JSON.stringify(await profitAtHammer(lot, lot.max)));
}
