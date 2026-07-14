const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const DESK = "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const YOUR = new Set(["74", "97", "135", "150", "172", "308", "344"]);

// Curated candidates (real firearms, plausible GBA identity)
const PICKS = [
  { lot: "56", mfr: "Smith & Wesson", model: "22A-1", cal: "22 LR", cat: "handgun" },
  { lot: "69", mfr: "CZ", model: "P-10M", cal: "9mm", cat: "handgun" },
  { lot: "133", mfr: "Browning", model: "Buck Mark", cal: "22 LR", cat: "handgun" },
  { lot: "171", mfr: "Smith & Wesson", model: "5903", cal: "9mm", cat: "handgun" },
  { lot: "10", mfr: "Smith & Wesson", model: "13-2", cal: "357 Magnum", cat: "handgun" },
  { lot: "19", mfr: "Beretta", model: "PX4 Storm", cal: "9mm", cat: "handgun" },
  { lot: "82", mfr: "Taurus", model: "GX4", cal: "9mm", cat: "handgun" },
  { lot: "95", mfr: "Canik", model: "TP9 SF", cal: "9mm", cat: "handgun" },
  { lot: "96", mfr: "Canik", model: "TP9 SFX", cal: "9mm", cat: "handgun" },
  { lot: "151", mfr: "Stoeger", model: "STR-9", cal: "9mm", cat: "handgun" },
  { lot: "158", mfr: "Taurus", model: "PT111 G2", cal: "9mm", cat: "handgun" },
  { lot: "140", mfr: "Ruger", model: "LC9", cal: "9mm", cat: "handgun" },
  { lot: "152", mfr: "Smith & Wesson", model: "M&P 40 Shield", cal: "40 S&W", cat: "handgun" },
  { lot: "173", mfr: "Ruger", model: "EC9s", cal: "9mm", cat: "handgun" },
  { lot: "170", mfr: "Ruger", model: "EC9s", cal: "9mm", cat: "handgun" },
  { lot: "137", mfr: "Kel Tec", model: "P11", cal: "9mm", cat: "handgun" },
  { lot: "161", mfr: "Taurus", model: "G3", cal: "9mm", cat: "handgun" },
  { lot: "5", mfr: "Remington", model: "1100", cal: "12 Gauge", cat: "shotgun" },
  { lot: "124", mfr: "Winchester", model: "Model 70", cal: "30-06", cat: "rifle" },
  { lot: "88", mfr: "Walther", model: "P22", cal: "22 LR", cat: "handgun" },
  { lot: "174", mfr: "Heritage", model: "Rough Rider", cal: "22 LR", cat: "handgun" },
  { lot: "136", mfr: "GSG", model: "Firefly", cal: "22 LR", cat: "handgun" },
];

function r2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function allIn(h) {
  return r2(h * 1.185);
}
function profitLocal(h, G) {
  return r2(G / 1.09 - allIn(h));
}
function safeMax(p25) {
  return Math.max(0, Math.floor((p25 / 1.09 - 50) / 1.185));
}

async function liveBid(lot) {
  for (let page = 1; page <= 6; page++) {
    const html = await (
      await fetch(`${AUCTION}?page=${page}&pageSize=100`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      })
    ).text();
    const re = new RegExp(
      `data-lotnumber="${lot}"[\\s\\S]*?class="title">([^<]+)[\\s\\S]*?class="winning-bid-amount">\\$([\\d,]+\\.\\d{2})`,
    );
    const m = html.match(re);
    if (m) return { title: m[1].replace(/&amp;/g, "&").trim(), bid: parseFloat(m[2].replace(/,/g, "")) };
  }
  return null;
}

const out = [];
for (const p of PICKS) {
  if (YOUR.has(p.lot)) continue;
  const live = await liveBid(p.lot);
  if (!live) continue;
  const bid = live.bid;
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      manufacturer: p.mfr,
      model: p.model,
      caliber: p.cal,
      category: p.cat,
      condition: "used",
      targetAcquisitionCost: bid,
      buyerPremiumPct: PREMIUM,
      inboundShip: 0,
      autoComps: true,
      targetProfit: 50,
      outboundShip: 30,
      listingUpgrades: 3,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const j = await res.json();
  const sold = j.result?.sold ?? {};
  const score = j.catalogMatch?.score;
  const p25 = sold.p25 ?? 0;
  const med = sold.median ?? 0;
  const n = sold.count ?? 0;
  const goodMatch = score >= 85;
  const p25p = profitLocal(bid, p25);
  const medp = profitLocal(bid, med);
  const sm = safeMax(p25);
  out.push({
    lot: p.lot,
    title: live.title,
    bid,
    maxSafe: sm,
    headroom: sm - bid,
    p25,
    median: med,
    soldN: n,
    p25Profit: p25p,
    medProfit: medp,
    go: goodMatch && p25p >= 50,
    watch: goodMatch && p25p >= 0 && p25p < 50,
    skip: !goodMatch || n < 5,
    gba: j.sourceStatus?.gba,
    score,
    listLocal: med,
  });
  await new Promise((r) => setTimeout(r, 400));
}

out.sort((a, b) => b.medProfit - a.medProfit);
console.log(JSON.stringify({ go: out.filter((x) => x.go), watch: out.filter((x) => x.watch), skip: out.filter((x) => x.skip) }, null, 2));
