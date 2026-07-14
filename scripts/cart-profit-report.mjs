/**
 * Cart profit report: all-in vs wear-adjusted market exit.
 */
const DESK = "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const LISTING = 3;
const TRANSFER = 0; // dealer FFL pickup — no transfer fee
const HAIRCUT = 35; // holster wear below P25

const CART = [
  { lot: 19, mfr: "Beretta", model: "PX4 Storm", caliber: "9mm", cat: "handgun", hammer: 225, title: "Beretta PX4 Storm + 2 mags/case" },
  { lot: 74, mfr: "Smith & Wesson", model: "915", caliber: "9mm", cat: "handgun", hammer: 55, title: "S&W Model 915" },
  { lot: 97, mfr: "Canik", model: "TP9SF", caliber: "9mm", cat: "handgun", hammer: 55, title: "Canik TP9 SF" },
  { lot: 135, mfr: "Canik", model: "METE MC9", caliber: "9mm", cat: "handgun", hammer: 90, title: "Canik Mete MC9", maxHammer: 125 },
  { lot: 150, mfr: "Smith & Wesson", model: "Model 422", caliber: "22LR", cat: "handgun", hammer: 80, title: "S&W Model 422" },
  { lot: 151, mfr: "Stoeger", model: "STR-9", caliber: "9mm", cat: "handgun", hammer: 30, title: "Stoeger STR-9" },
  { lot: 172, mfr: "Smith & Wesson", model: "M&P 40", caliber: "40 S&W", cat: "handgun", hammer: 55, title: "S&W M&P 40" },
];

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function fvf(G) {
  const capped = Math.min(G, 15000);
  return 0.06 * Math.min(capped, 400) + 0.04 * Math.max(0, capped - 400);
}

/** Buyer pays ship + card on GB (desk default) */
function gbNetBuyerPays(G, outbound) {
  return round2(G - fvf(G) - 5 - LISTING);
}

/** Seller absorbs ship + card (conservative) */
function gbNetSellerPays(G, outbound) {
  const card = 0.03 * (G + outbound);
  return round2(G - fvf(G) - 5 - outbound - card - LISTING);
}

function allIn(hammer) {
  return round2(hammer * (1 + PREMIUM / 100) + TRANSFER);
}

function wearExit(p25, haircut) {
  return round2(Math.max(0, p25 - haircut));
}

async function evalGun(g) {
  const outbound = 45;
  const body = {
    manufacturer: g.mfr,
    model: g.model,
    caliber: g.caliber,
    category: g.cat,
    condition: "used",
    targetAcquisitionCost: g.hammer,
    autoComps: true,
    targetProfit: 50,
    buyerPremiumPct: PREMIUM,
    inboundShip: 0,
    outboundShip: outbound,
    listingUpgrades: LISTING,
  };
  const j = await (
    await fetch(`${DESK}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();
  const sold = j.result?.sold ?? j.sold;
  return {
    p25: sold?.p25 ?? null,
    median: sold?.median ?? null,
    count: sold?.count ?? 0,
    catalog: j.catalogMatch ? `${j.catalogMatch.manufacturer} ${j.catalogMatch.model}` : null,
    outbound,
  };
}

console.log("Fetching comps and building report...\n");
const rows = [];
for (const g of CART) {
  const ev = await evalGun(g);
  const haircut = g.wearNote ? 15 : HAIRCUT;
  const marketP25 = ev.p25;
  const marketMedian = ev.median;
  const wornExit = marketP25 ? wearExit(marketP25, haircut) : null;
  const otd = allIn(g.hammer);
  const netBuyer = wornExit ? gbNetBuyerPays(wornExit, ev.outbound) : null;
  const netSeller = wornExit ? gbNetSellerPays(wornExit, ev.outbound) : null;
  rows.push({
    lot: g.lot,
    title: g.title,
    hammer: g.hammer,
    otd,
    comps: ev.count,
    catalog: ev.catalog,
    marketP25,
    marketMedian,
    wornExit,
    profitBuyerPays: netBuyer != null ? round2(netBuyer - otd) : null,
    profitSellerPays: netSeller != null ? round2(netSeller - otd) : null,
    gbNetBuyer: netBuyer,
    gbNetSeller: netSeller,
    haircut,
  });
}

console.log("| Lot | Gun | Hammer | All-In* | Mkt P25 | Worn Exit | Profit (buyer pays ship) | Profit (you pay ship) |");
console.log("|-----|-----|--------|---------|---------|-----------|--------------------------|----------------------|");
let totalOtd = 0;
let totalProfitBuyer = 0;
let totalProfitSeller = 0;
for (const r of rows) {
  totalOtd += r.otd;
  if (r.profitBuyerPays != null) totalProfitBuyer += r.profitBuyerPays;
  if (r.profitSellerPays != null) totalProfitSeller += r.profitSellerPays;
  console.log(
    `| ${r.lot} | ${r.title.slice(0, 28)} | $${r.hammer} | $${r.otd} | $${r.marketP25 ?? "—"} | $${r.wornExit ?? "—"} | $${r.profitBuyerPays ?? "—"} | $${r.profitSellerPays ?? "—"} |`,
  );
}
console.log(`\n*All-in = hammer × 1.185 + $${TRANSFER} Pearce transfer`);
console.log(`Worn exit = P25 − $${HAIRCUT} (Elite lot 95: −$15 only)`);
console.log(`\nCART TOTALS: All-in $${round2(totalOtd)} | Profit sum (buyer pays) $${round2(totalProfitBuyer)} | Profit sum (you pay ship) $${round2(totalProfitSeller)}`);
console.log("\nJSON:", JSON.stringify(rows, null, 2));
