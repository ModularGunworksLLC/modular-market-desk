/**
 * Scan Pearce summer auction for missed GO lots.
 * Scrapes live bids, evaluates via desk, excludes lots you're already winning.
 */
const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const INBOUND = 0;
const TARGET = 50;
const OUTBOUND = 30;
const LISTING = 3;

const YOUR_LOTS = new Set(["74", "97", "135", "150", "172", "308", "344"]);

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeAll() {
  const all = [];
  for (let page = 1; page <= 12; page++) {
    const url = `${AUCTION}?page=${page}&pageSize=100`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MMD-Desk/1.0)" },
    });
    if (!res.ok) break;
    const html = await res.text();
    const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
    let n = 0;
    let m;
    while ((m = cardRe.exec(html))) {
      const chunk = m[0];
      const lot = m[1];
      const titleM = chunk.match(/class="title">([^<]+)/);
      const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
      const bidsM = chunk.match(/<strong>Bids:<\/strong><span>(\d+)<\/span>/);
      if (!titleM || !bidM) continue;
      all.push({
        lot,
        title: decode(titleM[1]),
        bid: parseFloat(bidM[1].replace(/,/g, "")),
        bids: bidsM ? parseInt(bidsM[1], 10) : 0,
      });
      n++;
    }
    if (n === 0) break;
  }
  const seen = new Map();
  for (const l of all) seen.set(l.lot, l);
  return [...seen.values()].sort((a, b) => Number(a.lot) - Number(b.lot));
}

function parseGun(title) {
  const t = title.replace(/\s+/g, " ").trim();
  if (
    /silver|coin|sterling|ammunition|ammo box|box of \d+|knife|bow|crossbow|holster only|scope only|mount only|cleaning|target|sling|stock only|grip only|barrel only|upper only|lower only|parts kit|dies|press|reloading|safe\b|coin/i.test(
      t,
    )
  )
    return null;
  if (/magazine|mags?\b/i.test(t) && !/pistol|rifle|shotgun|carbine|firearm/i.test(t))
    return null;

  const caliberMatch = t.match(
    /\b(\d{1,2}\s*Gauge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|x19|mm|S&W)|9mm|10mm|22LR|22 Cal|38 Cal|44 Magnum|357 Magnum|45 Colt|45-Auto|5\.56|\.223|\.308|410|7\.62|300 BLK)\b/i,
  );
  const caliber = caliberMatch ? caliberMatch[1].replace(/\s+/g, " ") : "";

  const mfrPatterns = [
    ["Smith & Wesson", /Smith\s*&\s*Wesson/i],
    ["Canik", /^Canik\b/i],
    ["Glock", /^Glock\b|^Never Fired Glock\b/i],
    ["Beretta", /^Beretta\b/i],
    ["Ruger", /^Ruger\b/i],
    ["Remington", /^Remington\b/i],
    ["Browning", /^Browning\b/i],
    ["Colt", /^Colt\b|^\d{4} Colt\b/i],
    ["HK", /^HK\b/i],
    ["Sig Sauer", /^Sig\s*Sauer\b/i],
    ["Springfield", /^Springfield\b/i],
    ["Taurus", /^Taurus\b/i],
    ["CZ", /^CZ\b/i],
    ["Mossberg", /^Mossberg\b/i],
    ["Savage", /^Savage\b/i],
    ["Henry", /^Henry\b/i],
    ["Marlin", /^Marlin\b/i],
    ["Kimber", /^Kimber\b/i],
    ["Kel Tec", /^Kel\s*[- ]?Tec\b/i],
    ["Hi-Point", /^Hi-Point\b/i],
    ["Rock Island Armory", /^Rock Island Armory\b/i],
    ["Winchester", /^Winchester\b/i],
    ["Rossi", /^Rossi\b/i],
    ["Bond Arms", /^Bond Arms\b/i],
    ["Heritage", /^Heritage\b/i],
    ["Diamondback", /^Diamondback\b/i],
    ["IWI", /^IWI\b/i],
    ["Century Arms", /^Century Arms\b/i],
    ["Zastava", /^Zastava\b/i],
    ["Stoeger", /^Stoeger\b/i],
    ["FN", /^FN\b/i],
    ["PSA", /^PSA\b|Palmetto/i],
    ["Anderson", /^Anderson\b/i],
    ["Aero Precision", /^Aero Precision\b/i],
    ["Daniel Defense", /^Daniel Defense\b/i],
    ["BCM", /^BCM\b|Bravo Company/i],
    ["Bushmaster", /^Bushmaster\b/i],
    ["Windham", /^Windham\b/i],
    ["Stag Arms", /^Stag Arms\b/i],
    ["Thompson Center", /^Thompson Center\b/i],
    ["High Standard", /^High Standard\b/i],
    ["Sharps Bros", /^Sharps Bros\b/i],
    ["Spikes Tactical", /^Spikes Tactical\b/i],
    ["Revolution Armory", /^Revolution Armory\b/i],
    ["Good Times Outdoors", /^Good Times Outdoors\b/i],
    ["Adler Arms", /^Adler Arms\b/i],
    ["G Force Arms", /^G Force Arms\b/i],
    ["Black Aces Tactical", /^Black Aces Tactical\b/i],
    ["Radikal Arms", /^Radikal Arms\b/i],
    ["Tokarev", /^Tokarev\b/i],
    ["SDS", /^SDS\b/i],
    ["Silver Eagle", /^Silver Eagle\b/i],
    ["Benelli", /^Benelli\b/i],
    ["Weatherby", /^Weatherby\b/i],
    ["Bergara", /^Bergara\b/i],
    ["Howa", /^Howa\b/i],
    ["Christensen Arms", /^Christensen Arms\b/i],
    ["DPMS", /^DPMS\b/i],
    ["Magnum Research", /^Magnum Research\b/i],
    ["North American Arms", /^North American Arms\b/i],
    ["North American Arms", /^NAA\b/i],
    ["Charter Arms", /^Charter Arms\b/i],
    ["SCCY", /^SCCY\b/i],
    ["Bersa", /^Bersa\b/i],
    ["Walther", /^Walther\b/i],
    ["Mauser", /^Mauser\b/i],
    ["PTR", /^PTR\b/i],
    ["LWRC", /^LWRC\b/i],
    ["Barrett", /^Barrett\b/i],
  ];

  let manufacturer = "";
  for (const [name, re] of mfrPatterns) {
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

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|barrel assembly|AR-15|AR15|M&P15|MP15/i.test(t)
      ? "rifle"
      : "handgun";
  const condition = /never fired|new in box|unfired/i.test(t) ? "new" : "used";

  return { manufacturer, model, caliber, category, condition };
}

function r2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function allIn(h) {
  return r2(h * 1.185);
}
function fvf(G) {
  const c = Math.min(G, 15000);
  return r2(0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400));
}
function profitLocal(hammer, G) {
  return r2(G / 1.09 - allIn(hammer));
}
function safeMaxHammer(p25G) {
  const loc = r2(p25G / 1.09);
  return Math.max(0, Math.floor((loc - TARGET) / 1.185));
}

async function evaluate(gun, bid) {
  const body = {
    manufacturer: gun.manufacturer,
    model: gun.model,
    caliber: gun.caliber,
    category: gun.category,
    condition: gun.condition,
    targetAcquisitionCost: bid,
    inboundShip: INBOUND,
    buyerPremiumPct: PREMIUM,
    autoComps: true,
    targetProfit: TARGET,
    minMarginPct: 15,
    outboundShip: OUTBOUND,
    listingUpgrades: LISTING,
  };
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  return res.json();
}

const lots = await scrapeAll();
console.error(`Scraped ${lots.length} lots`);

const candidates = lots.filter((l) => !YOUR_LOTS.has(l.lot));
const parsed = [];
for (const l of candidates) {
  const gun = parseGun(l.title);
  if (!gun) continue;
  if (l.bid > 400) continue; // skip expensive for velocity flips
  parsed.push({ ...l, ...gun });
}

console.error(`Evaluating ${parsed.length} gun lots (bid <= $400, not in your cart)...`);

const results = [];
for (let i = 0; i < parsed.length; i++) {
  const l = parsed[i];
  try {
    const j = await evaluate(l, l.bid);
    const sold = j.result?.sold ?? {};
    const p25 = sold.p25 ?? 0;
    const med = sold.median ?? 0;
    const count = sold.count ?? 0;
    if (count < 5 || !p25) {
      results.push({ ...l, skip: "no comps", gba: j.sourceStatus?.gba });
      continue;
    }
    const p25Profit = profitLocal(l.bid, p25);
    const medProfit = profitLocal(l.bid, med);
    const maxSafe = safeMaxHammer(p25);
    const headroom = maxSafe - l.bid;
    const goNow = p25Profit >= TARGET;
    const beNow = p25Profit >= 0;
    results.push({
      lot: l.lot,
      title: l.title,
      bid: l.bid,
      bids: l.bids,
      manufacturer: l.manufacturer,
      model: l.model,
      soldCount: count,
      p25,
      median: med,
      p25Profit,
      medProfit,
      maxSafe,
      headroom,
      goNow,
      beNow,
      listLocal: med,
      gba: j.sourceStatus?.gba,
      deskMax: j.result?.maxBid,
    });
  } catch (e) {
    results.push({ ...l, error: e.message });
  }
  if ((i + 1) % 10 === 0) console.error(`  ${i + 1}/${parsed.length}`);
  await new Promise((r) => setTimeout(r, 300));
}

const go = results
  .filter((r) => r.goNow)
  .sort((a, b) => b.medProfit - a.medProfit);
const watch = results
  .filter((r) => !r.goNow && r.beNow && r.headroom > 20)
  .sort((a, b) => b.headroom - a.headroom);
const near = results
  .filter((r) => !r.goNow && !r.beNow && r.headroom > 0 && r.maxSafe)
  .sort((a, b) => b.headroom - a.headroom);

console.log(
  JSON.stringify(
    {
      scanned: lots.length,
      yourLots: [...YOUR_LOTS],
      evaluated: parsed.length,
      goAtCurrentBid: go.length,
      topGo: go.slice(0, 25),
      watchBreakEven: watch.slice(0, 15),
      hasHeadroomNotGo: near.slice(0, 10),
    },
    null,
    2,
  ),
);
