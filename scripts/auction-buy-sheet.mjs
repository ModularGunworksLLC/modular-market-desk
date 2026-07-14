/**
 * Full Pearce auction buy sheet — conservative P25, GunBroker exit, $50 net profit.
 */
import fs from "fs";
import { parse } from "csv-parse/sync";

const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const DESK = "https://desk.modulargunworks.com";
const LIPSEY =
  "C:/Users/micha/Downloads/Lipsey's-Catalog-05-06-2026,_13-12-19.csv";

const PREMIUM = 18.5;
const TARGET = 50;
const LISTING = 3;
const MIN_SOLD = 10;
const MIN_SCORE = 50;

/** User's active cart — always assessed */
const MY_CART = new Set([19, 95, 96, 97, 135, 308, 344]);

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function fvf(G) {
  const capped = Math.min(G, 15000);
  return 0.06 * Math.min(capped, 400) + 0.04 * Math.max(0, capped - 400);
}

function gbNet(G, outbound) {
  const card = 0.03 * (G + outbound);
  return round2(G - fvf(G) - 5 - outbound - card - LISTING);
}

function allIn(hammer) {
  return round2(hammer * (1 + PREMIUM / 100));
}

function walkAwayHammer(gbProceeds) {
  const maxAllIn = gbProceeds - TARGET;
  if (maxAllIn <= 0) return 0;
  return round2(Math.max(0, maxAllIn / (1 + PREMIUM / 100)));
}

function profitAtHammer(hammer, p25, outbound) {
  if (!p25 || hammer <= 0) return null;
  return round2(gbNet(p25, outbound) - allIn(hammer));
}

function outboundFor(cat) {
  return /rifle|shotgun/.test(cat) ? 60 : 45;
}

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGun(title) {
  const t = decode(title);
  if (
    /silver|coin|sterling|ammo|round|grain|qty:|\/box|knife|bow|crossbow|magazine lot|^\(.*\)\s*ruger.*mag|troy.*mag/i.test(
      t,
    )
  )
    return { accessory: true, title: t };

  const caliberMatch = t.match(
    /\b(\d{1,2}\s*Gauge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|x19|mm)|9mm|10mm|22LR|22 Cal|44 Magnum|357 Magnum|45 Colt|45-Auto|5\.56|223|410)\b/i,
  );
  const caliber = caliberMatch ? caliberMatch[1].replace(/\s+/g, " ") : "";

  const patterns = [
    ["Smith & Wesson", /Smith\s*&\s*Wesson/i],
    ["Glock", /^Glock\b|^Never Fired Glock\b/i],
    ["Remington", /^Remington\b/i],
    ["Ruger", /^Ruger\b/i],
    ["Browning", /^Browning\b/i],
    ["Colt", /^Colt\b|^\d{4} Colt\b/i],
    ["Beretta", /^Beretta\b/i],
    ["HK", /^HK\b/i],
    ["Kimber", /^Kimber\b/i],
    ["Kel Tec", /^Kel\s*[- ]?Tec\b|^Never Fired Kel/i],
    ["Hi-Point", /^Hi-Point\b/i],
    ["Thompson Center", /^Thompson Center\b/i],
    ["High Standard", /^High Standard\b/i],
    ["Sharps Bros", /^Sharps Bros\b/i],
    ["Spikes Tactical", /^Spikes Tactical\b/i],
    ["Bond Arms", /^Bond Arms\b/i],
    ["Winchester", /^Winchester\b/i],
    ["Rossi", /^Rossi\b/i],
    ["Savage", /^Savage\b/i],
    ["Henry", /^Henry\b/i],
    ["Marlin", /^Marlin\b/i],
    ["Mossberg", /^Mossberg\b/i],
    ["Sig Sauer", /^Sig\s*Sauer\b/i],
    ["Springfield", /^Springfield\b/i],
    ["CZ", /^CZ\b/i],
    ["Canik", /^Canik\b/i],
    ["Taurus", /^Taurus\b/i],
    ["Benelli", /^Benelli\b/i],
    ["FN", /^FN\b/i],
    ["Stoeger", /^Stoeger\b/i],
    ["Bushmaster", /^Bushmaster\b/i],
    ["IWI", /^IWI\b/i],
    ["Anderson", /^Anderson\b/i],
    ["Aero Precision", /^Aero Precision\b/i],
    ["Daniel Defense", /^Daniel Defense\b/i],
    ["Heritage", /^Heritage\b/i],
    ["Diamondback", /^Diamondback\b/i],
    ["PSA", /^PSA\b|Palmetto/i],
    ["Century Arms", /^Century Arms\b/i],
    ["Zastava", /^Zastava\b/i],
    ["Weatherby", /^Weatherby\b/i],
    ["Bergara", /^Bergara\b/i],
    ["Howa", /^Howa\b/i],
    ["Windham", /^Windham\b/i],
    ["DPMS", /^DPMS\b/i],
    ["TriStar", /^TriStar\b/i],
    ["Citadel", /^Citadel\b/i],
    ["Tokarev", /^Tokarev\b/i],
    ["Black Aces Tactical", /^Black Aces Tactical\b/i],
    ["Radikal Arms", /^Radikal Arms\b/i],
    ["Adler Arms", /^Adler Arms\b/i],
    ["G Force Arms", /^G Force Arms\b/i],
    ["Good Times Outdoors", /^Good Times Outdoors\b/i],
    ["Silver Eagle", /^Silver Eagle\b/i],
    ["SDS", /^SDS\b/i],
    ["Tippmann", /^Tippmann\b/i],
    ["Marlin", /^Marlin\b/i],
    ["Iver Johnson", /^Iver Johnson\b/i],
    ["Charter Arms", /^Charter Arms\b/i],
    ["North American Arms", /^North American Arms\b/i],
    ["Rock Island Armory", /^Rock Island/i],
    ["Walther", /^Walther\b/i],
    ["Magnum Research", /^Magnum Research\b/i],
    ["Auto-Ordnance", /^Auto-Ordnance\b/i],
  ];

  let manufacturer = "";
  for (const [name, re] of patterns) {
    if (re.test(t)) {
      manufacturer = name;
      break;
    }
  }
  if (!manufacturer) return null;

  let model = t
    .replace(/^Never Fired\s+/i, "")
    .replace(/^\d{4}\s+/, "")
    .replace(new RegExp(`^${manufacturer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .replace(/,?\s*SN\s+[\w-]+.*$/i, "")
    .replace(/\s+with\s+.*$/i, "")
    .replace(/\s+in\s+(Box|Hard Case).*$/i, "")
    .trim();

  if (manufacturer === "Springfield" && /^armory\s+/i.test(model)) {
    model = model.replace(/^armory\s+/i, "");
  }
  if (caliber) {
    model = model.replace(new RegExp(caliber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
    model = model.replace(/\b9\s*x\s*19\b/gi, " ");
    model = model.replace(/\b9mm\b/gi, " ");
  }
  model = model
    .replace(/\b\d{1,2}\s*gauge\b/gi, " ")
    .replace(
      /\b\.?\d{2,3}\s*(lr|wmr|mag|acp|auto|nato|rem|sprg|wylde|win\s*mag|x19|mm|cal|caliber)\b/gi,
      " ",
    )
    .replace(/\b45-?auto\b/gi, " ")
    .replace(
      /\b(pistol|handgun|rifle|shotgun|revolver|carbine|semi-?automatic|semi|auto|luger|magnum|nato|wylde|rem|colt|gauge|guage)\b/gi,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim();

  if (manufacturer === "Smith & Wesson" && /M&P\s*15/i.test(t)) model = "M&P15";
  if (manufacturer === "Smith & Wesson" && /M&P\s*45/i.test(t)) model = "M&P45";

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|AR-?15|M&P\s*15/i.test(t)
      ? "rifle"
      : "handgun";

  const condition = /never fired|new in box|unfired/i.test(t) ? "new" : "used";

  const apiModel = model
    .replace(/\bMete\b/i, "METE")
    .replace(/\bTP9\s*SF\b/i, "TP9SF")
    .replace(/\bTP9\s*SFX\b/i, "TP9SFX")
    .replace(/\bPX4\s*Storm\b/i, "PX4 Storm");

  return {
    manufacturer,
    model: apiModel,
    caliber,
    category,
    condition,
    key: `${manufacturer}|${apiModel}|${caliber}|${category}|${condition}`,
  };
}

function extractLots(html) {
  const lots = [];
  const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
  let block;
  while ((block = cardRe.exec(html)) !== null) {
    const chunk = block[0];
    const lot = block[1];
    if (["0", "00", "000"].includes(lot)) continue;
    const titleM = chunk.match(/class="title">([^<]+)/);
    const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
    if (!titleM || !bidM) continue;
    lots.push({
      lot: String(lot),
      title: decode(titleM[1]),
      bid: parseFloat(bidM[1].replace(/,/g, "")),
    });
  }
  return lots;
}

async function fetchLots() {
  const map = new Map();
  for (let page = 1; page <= 6; page++) {
    const html = await (await fetch(`${AUCTION}?page=${page}&pageSize=100`)).text();
    for (const lot of extractLots(html)) map.set(lot.lot, lot);
    if (extractLots(html).length === 0) break;
  }
  return [...map.values()].sort((a, b) => Number(a.lot) - Number(b.lot));
}

const evalCache = new Map();

async function deskEval(gun) {
  if (evalCache.has(gun.key)) return evalCache.get(gun.key);
  const body = {
    manufacturer: gun.manufacturer,
    model: gun.model,
    caliber: gun.caliber,
    category: gun.category,
    condition: gun.condition,
    targetAcquisitionCost: 100,
    autoComps: true,
    targetProfit: TARGET,
    buyerPremiumPct: PREMIUM,
    inboundShip: 0,
    outboundShip: outboundFor(gun.category),
  };
  try {
    const j = await (
      await fetch(`${DESK}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
    const r = j.result ?? j;
    const out = {
      p25: r.sold?.p25 ?? null,
      median: r.sold?.median ?? null,
      soldCount: r.sold?.count ?? 0,
      catalog: j.catalogMatch
        ? `${j.catalogMatch.manufacturer} ${j.catalogMatch.model} (${j.catalogMatch.conditionParam})`
        : null,
      score: j.catalogMatch?.score ?? 0,
    };
    evalCache.set(gun.key, out);
    return out;
  } catch {
    const out = { p25: null, median: null, soldCount: 0, catalog: null, score: 0 };
    evalCache.set(gun.key, out);
    return out;
  }
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function loadLipsey() {
  const raw = fs.readFileSync(LIPSEY, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  return rows.filter((r) => String(r.ITEMTYPE).toLowerCase() === "firearm");
}

function lipseyMatch(gun, firearms) {
  const scored = firearms
    .map((lr) => {
      const mfr = norm(lr.MANUFACTURER);
      const qMfr = norm(gun.manufacturer);
      if (!mfr.includes(qMfr.slice(0, 4)) && !qMfr.includes(mfr.slice(0, 4))) return { lr, score: 0 };
      const hay = norm(`${lr.MANUFACTURER} ${lr.MODEL} ${lr.DESCRIPTION1}`);
      const tokens = gun.model.toLowerCase().split(/[\s\-\/]+/).filter((t) => t.length > 1);
      let score = 25;
      for (const tok of tokens) {
        if (hay.includes(norm(tok))) score += 15;
      }
      if (/\bsfx\b/i.test(hay) && /\bsf\b/i.test(gun.model) && !/\bsfx\b/i.test(gun.model)) score -= 40;
      if (/\btp9sfx\b/i.test(hay) && /\btp9sf\b/i.test(gun.model)) score -= 40;
      if (/\brival\b/i.test(hay) && !/\brival\b/i.test(gun.model)) score -= 20;
      if (/\bprime\b/i.test(hay) && !/\bprime\b/i.test(gun.model)) score -= 15;
      return { lr, score };
    })
    .filter((x) => x.score >= 55)
    .sort((a, b) => b.score - a.score || Number(a.lr.CURRENTPRICE) - Number(b.lr.CURRENTPRICE));
  const best = scored[0];
  if (!best) return null;
  return {
    price: Number(best.lr.CURRENTPRICE || best.lr.PRICE),
    sku: best.lr.ITEMNO,
    desc: `${best.lr.MODEL} — ${(best.lr.DESCRIPTION1 || "").slice(0, 35)}`,
  };
}

console.error("Fetching auction lots...");
const lots = await fetchLots();
console.error(`Lots: ${lots.length}`);

const lipseyGuns = loadLipsey();
console.error(`Lipsey firearms: ${lipseyGuns.length}`);

const gunLots = [];
for (const lot of lots) {
  const parsed = parseGun(lot.title);
  if (!parsed) continue;
  if (parsed.accessory) {
    if (MY_CART.has(Number(lot.lot))) {
      gunLots.push({ ...lot, parsed, isAccessory: true });
    }
    continue;
  }
  gunLots.push({ ...lot, parsed, isAccessory: false });
}

const unique = [...new Map(gunLots.filter((l) => !l.isAccessory).map((l) => [l.parsed.key, l.parsed])).values()];
console.error(`Unique guns to eval: ${unique.length}`);

for (let i = 0; i < unique.length; i += 4) {
  await Promise.all(unique.slice(i, i + 4).map((g) => deskEval(g)));
  console.error(`Eval ${Math.min(i + 4, unique.length)}/${unique.length}`);
}

const rows = [];
for (const lot of gunLots) {
  if (lot.isAccessory) {
    rows.push({
      lot: lot.lot,
      title: lot.title.slice(0, 55),
      liveBid: lot.bid,
      maxBid: null,
      p25Resale: null,
      allInAtMax: null,
      profitAtMax: null,
      profitAtLive: null,
      lipsey: null,
      soldCount: null,
      headroom: null,
      section: MY_CART.has(Number(lot.lot)) ? "MY CART" : "SKIP",
      verdict: "ACCESSORY — not in firearm flip scan",
      inCart: true,
    });
    continue;
  }

  const ev = evalCache.get(lot.parsed.key) ?? { p25: null, soldCount: 0, score: 0 };
  const outbound = outboundFor(lot.parsed.category);
  const p25 = ev.p25;
  const net = p25 ? gbNet(p25, outbound) : null;
  const maxBid = net ? walkAwayHammer(net) : 0;
  const profitAtMax = maxBid > 0 ? TARGET : null;
  const profitAtLive = profitAtHammer(lot.bid, p25, outbound);
  const lipsey = lipseyMatch(lot.parsed, lipseyGuns);
  const dealerFloor = lipsey && lipsey.price < lot.bid;

  const compOk = ev.soldCount >= MIN_SOLD && ev.score >= MIN_SCORE && p25 > 0;
  const goAtLive = profitAtLive != null && profitAtLive >= TARGET;
  const bidOk = maxBid > lot.bid && compOk && !dealerFloor;

  const inCart = MY_CART.has(Number(lot.lot));
  let section = "SKIP";
  if (inCart) section = "MY CART";
  else if (bidOk) section = "BID ON";

  let verdict = "NO-GO";
  if (!compOk) verdict = `LOW COMPS (${ev.soldCount} sold, score ${Math.round(ev.score)})`;
  else if (dealerFloor) verdict = `DEALER FLOOR — Lipsey $${lipsey.price} < live $${lot.bid}`;
  else if (goAtLive && maxBid >= lot.bid) verdict = inCart ? "HOLD / RAISE MAX" : "GO — SET MAX BID";
  else if (maxBid > 0 && lot.bid > maxBid) verdict = "NO-GO — over walk-away";
  else verdict = "NO-GO";

  rows.push({
    lot: lot.lot,
    title: lot.title.slice(0, 55),
    liveBid: lot.bid,
    maxBid: compOk ? maxBid : null,
    p25Resale: p25,
    gbNet: net,
    allInAtMax: maxBid ? allIn(maxBid) : null,
    profitAtMax,
    profitAtLive,
    lipsey: lipsey?.price ?? null,
    lipseySku: lipsey?.sku ?? null,
    soldCount: ev.soldCount,
    catalog: ev.catalog,
    headroom: compOk ? round2(maxBid - lot.bid) : null,
    section,
    verdict,
    inCart,
    compOk,
  });
}

const cart = rows.filter((r) => r.section === "MY CART");
const bidOn = rows
  .filter((r) => r.section === "BID ON")
  .sort((a, b) => (b.profitAtMax ?? 0) - (a.profitAtMax ?? 0) || (b.headroom ?? 0) - (a.headroom ?? 0));

fs.writeFileSync("scripts/auction-buy-sheet.json", JSON.stringify({ cart, bidOn, generated: new Date().toISOString() }, null, 2));

function printTable(items, label) {
  console.log(`\n## ${label} (${items.length})\n`);
  console.log(
    "| Lot | Item | Live | SET MAX BID | P25 GB Resale | All-in@Max | Profit@Max | Profit@Live | Lipsey | Headroom | Verdict |",
  );
  console.log(
    "|-----|------|------|-------------|---------------|------------|------------|-------------|--------|----------|---------|",
  );
  for (const r of items) {
    const fmt = (n) => (n == null ? "—" : `$${n}`);
    console.log(
      `| ${r.lot} | ${r.title} | ${fmt(r.liveBid)} | ${fmt(r.maxBid)} | ${fmt(r.p25Resale)} | ${fmt(r.allInAtMax)} | ${r.profitAtMax != null ? `$${r.profitAtMax}` : "—"} | ${fmt(r.profitAtLive)} | ${fmt(r.lipsey)} | ${r.headroom != null ? `$${r.headroom}` : "—"} | ${r.verdict} |`,
    );
  }
}

printTable(cart, "YOUR CURRENT CART — assess & keep if profitable");
printTable(bidOn, "NEW OPPORTUNITIES — set max bid & walk away");

const tripGuns = [...cart.filter((r) => r.maxBid && r.profitAtLive >= TARGET), ...bidOn].length;
console.log(`\n**Trip bundle:** ${tripGuns} profitable firearms (cart + new) at current/live bids with GB @ P25.\n`);
