const DESK = "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const INBOUND = 0;
const TARGET = 50;

const lots = [
  { lot: 19, title: "Beretta PX4 Storm", mfr: "Beretta", model: "PX4 Storm", cal: "9mm", cat: "handgun", cond: "used", bid: 225, maxBid: 225 },
  { lot: 82, title: "Taurus GX4", mfr: "Taurus", model: "GX4", cal: "9mm", cat: "handgun", cond: "used", bid: 65, maxBid: 65 },
  { lot: 94, title: "S&W M&P 45", mfr: "Smith & Wesson", model: "M&P45", cal: ".45 ACP", cat: "handgun", cond: "used", bid: 175, maxBid: 150 },
  { lot: 95, title: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun", cond: "used", bid: 40, maxBid: 65 },
  { lot: 96, title: "Canik TP9 SFX", mfr: "Canik", model: "TP9 SFX", cal: "9mm", cat: "handgun", cond: "used", bid: 30, maxBid: 100 },
  { lot: 97, title: "Canik TP9 SF", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun", cond: "used", bid: 55, maxBid: 75 },
  { lot: 135, title: "Canik Mete MC9", mfr: "Canik", model: "Mete MC9", cal: "9mm", cat: "handgun", cond: "used", bid: 70, maxBid: 70 },
];

async function evalAt(lot, hammer) {
  const body = {
    manufacturer: lot.mfr,
    model: lot.model,
    caliber: lot.cal,
    category: lot.cat,
    condition: lot.cond,
    targetAcquisitionCost: hammer,
    autoComps: true,
    targetProfit: TARGET,
    buyerPremiumPct: PREMIUM,
    inboundShip: INBOUND,
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
    hammer,
    allIn: Math.round(hammer * (1 + PREMIUM / 100) * 100) / 100,
    p25Sold: r.sold?.p25,
    soldCount: r.sold?.count,
    verdict: p25.verdict ?? (p25.netProfit >= TARGET ? "GO" : "NO-GO"),
    maxHammer: p25.maxBid,
    netProfit: p25.netProfit,
    marginPct: p25.marginPct,
    gba: j.sourceStatus?.gba,
  };
}

for (const lot of lots) {
  const atBid = await evalAt(lot, lot.bid);
  const atMax = lot.maxBid !== lot.bid ? await evalAt(lot, lot.maxBid) : null;
  const headroom = atBid.maxHammer != null ? atBid.maxHammer - lot.bid : null;
  const maxHeadroom = atMax?.maxHammer != null ? atMax.maxHammer - lot.maxBid : null;
  console.log(
    JSON.stringify({
      lot: lot.lot,
      title: lot.title,
      yourBid: lot.bid,
      yourMax: lot.maxBid,
      status: lot.lot === 94 ? "OUTBID" : "WINNING",
      atCurrentBid: atBid,
      headroom,
      atYourMax: atMax,
      maxHeadroom,
    }),
  );
}
