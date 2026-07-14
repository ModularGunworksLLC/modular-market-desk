/**
 * Find GO lots with strong headroom not in the user's current bid list.
 */
const DESK = "https://desk.modulargunworks.com";
const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const PREMIUM = 18.5;
const MY_LOTS = new Set([19, 82, 94, 95, 96, 97, 135, 308, 344]);

function outboundForCategory(cat) {
  const c = String(cat).toLowerCase();
  return /rifle|shotgun/.test(c) ? 60 : 45;
}

function decode(s) {
  return String(s).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function parseGun(title) {
  const t = decode(title);
  if (/silver|coin|sterling|ammo|round|grain|qty:|\/box|knife|bow|crossbow|magazine lot/i.test(t))
    return null;

  const caliberMatch = t.match(
    /\b(\d{1,2}\s*Gauge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|x19|mm)|9mm|10mm|22LR|22 Cal|44 Magnum|357 Magnum|45 Colt|45-Auto|5\.56|223|410)\b/i,
  );
  const caliber = caliberMatch ? caliberMatch[1].replace(/\s+/g, " ") : "";

  const mfrPatterns = [
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
    ["Revolution Armory", /^Revolution Armory\b/i],
    ["Rock Island Armory", /^Rock Island Armory\b/i],
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

  if (manufacturer === "Smith & Wesson" && /M&P\s*15/i.test(t)) model = "M&P15";
  if (manufacturer === "Smith & Wesson" && /M&P\s*45/i.test(t)) model = "M&P45";

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|barrel assembly|AR-?15|M&P\s*15/i.test(t)
      ? "rifle"
      : "handgun";

  const condition = /never fired|new in box|unfired/i.test(t) ? "new" : "used";

  return { manufacturer, model, caliber, category, condition };
}

async function fetchLiveLots() {
  const lots = [];
  for (let page = 1; page <= 6; page++) {
    const html = await (await fetch(`${AUCTION}?page=${page}&pageSize=100`)).text();
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
        lot,
        title: titleM[1].trim(),
        bid: parseFloat(bidM[1].replace(/,/g, "")),
      });
    }
  }
  return lots;
}

async function evalLot(gun, bid) {
  const body = {
    manufacturer: gun.manufacturer,
    model: gun.model,
    caliber: gun.caliber,
    category: gun.category,
    condition: gun.condition,
    targetAcquisitionCost: bid,
    autoComps: true,
    targetProfit: 50,
    buyerPremiumPct: PREMIUM,
    inboundShip: 0,
    outboundShip: outboundForCategory(gun.category),
  };
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) return { error: true };
  const r = j.result ?? j;
  const p25 = r.scenarios?.find((s) => s.label === "P25") ?? r;
  return {
    p25: r.sold?.p25,
    median: r.sold?.median,
    soldCount: r.sold?.count ?? 0,
    verdict: p25.verdict ?? (p25.netProfit >= 50 ? "GO" : "NO-GO"),
    maxBid: p25.maxBid,
    netProfit: p25.netProfit,
    marginPct: p25.marginPct,
    gba: j.sourceStatus?.gba,
  };
}

const lots = await fetchLiveLots();
console.error(`Live lots: ${lots.length}`);

const candidates = lots.filter((l) => !MY_LOTS.has(Number(l.lot)));
const toEval = [];
for (const lot of candidates) {
  const gun = parseGun(lot.title);
  if (gun) toEval.push({ ...lot, gun });
}
console.error(`Guns to eval (not in your list): ${toEval.length}`);

const results = [];
const CONC = 4;
for (let i = 0; i < toEval.length; i += CONC) {
  const batch = toEval.slice(i, i + CONC);
  const evs = await Promise.all(batch.map((x) => evalLot(x.gun, x.bid)));
  batch.forEach((x, j) => {
    const ev = evs[j];
    if (!ev || ev.error || ev.soldCount === 0) return;
    const walkAway = ev.maxBid;
    const headroom = walkAway != null ? walkAway - x.bid : null;
    results.push({
      lot: x.lot,
      title: x.title,
      bid: x.bid,
      walkAway,
      headroom,
      p25: ev.p25,
      median: ev.median,
      profit: ev.netProfit,
      marginPct: ev.marginPct,
      verdict: ev.verdict,
      soldCount: ev.soldCount,
      gba: ev.gba,
    });
  });
  if ((i + CONC) % 20 === 0) console.error(`  ${Math.min(i + CONC, toEval.length)}/${toEval.length}`);
}

const go = results
  .filter((r) => r.verdict === "GO" && r.headroom != null && r.headroom >= 20)
  .sort((a, b) => b.headroom - a.headroom);

const near = results
  .filter((r) => r.verdict !== "GO" && r.headroom != null && r.headroom > -30 && r.soldCount >= 5)
  .sort((a, b) => b.headroom - a.headroom)
  .slice(0, 10);

console.log(
  JSON.stringify(
    {
      yourLots: [...MY_LOTS],
      missedGo: go.slice(0, 35),
      watchList: near,
      stats: {
        evaluated: results.length,
        goCount: go.length,
      },
    },
    null,
    2,
  ),
);
