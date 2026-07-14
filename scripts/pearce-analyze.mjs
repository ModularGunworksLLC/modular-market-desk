/**
 * Scrape Pearce auction pages + evaluate via production desk API.
 * Usage: node scripts/pearce-analyze.mjs
 */
const AUCTION_BASE =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const INBOUND = 0;
const TARGET_PROFIT = 50;

const LOT_RE =
  /Lot (\d+):([^\n]+)\n[\s\S]*?\$([\d,]+\.\d{2})\nBids:(\d+)/g;

async function fetchPage(page) {
  const url = page === 1 ? AUCTION_BASE : `${AUCTION_BASE}?page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MMD-Desk/1.0)" },
  });
  if (!res.ok) throw new Error(`Page ${page}: HTTP ${res.status}`);
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{2,}/g, "\n");
  const lots = [];
  let m;
  while ((m = LOT_RE.exec(text)) !== null) {
    lots.push({
      lot: m[1],
      title: m[2].trim(),
      bid: parseFloat(m[3].replace(/,/g, "")),
      bids: parseInt(m[4], 10),
    });
  }
  return lots;
}

function parseGun(title) {
  const t = title.replace(/\s+/g, " ").trim();
  if (/silver|coin|sterling|ammo|knife|bow|crossbow|magazine lot|holster/i.test(t))
    return null;

  const caliberMatch = t.match(
    /\b(\d{1,2}\s*Gauge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|x19|mm)|9mm|10mm|22LR|22 Cal|38 Cal|44 Magnum|357 Magnum|45 Colt|45-Auto|5\.56|223|410)\b/i,
  );
  const caliber = caliberMatch ? caliberMatch[1].replace(/\s+/g, " ") : "";

  const mfrPatterns = [
    ["Smith & Wesson", /Smith\s*&\s*Wesson/i],
    ["Glock", /^Glock\b/i],
    ["Remington", /^Remington\b/i],
    ["Ruger", /^Ruger\b/i],
    ["Browning", /^Browning\b/i],
    ["Colt", /^Colt\b|^\d{4} Colt\b/i],
    ["Beretta", /^Beretta\b/i],
    ["HK", /^HK\b/i],
    ["Kimber", /^Kimber\b/i],
    ["Kel Tec", /^Kel\s*[- ]?Tec\b/i],
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
    ["Tippmann", /^Tippmann\b/i],
    ["Good Times Outdoors", /^Good Times Outdoors\b/i],
    ["Adler Arms", /^Adler Arms\b/i],
    ["G Force Arms", /^G Force Arms\b/i],
    ["Black Aces Tactical", /^Black Aces Tactical\b/i],
    ["Radikal Arms", /^Radikal Arms\b/i],
    ["Tokarev", /^Tokarev\b/i],
    ["SDS", /^SDS\b/i],
    ["Silver Eagle", /^Silver Eagle\b/i],
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
    .replace(/^\d{4}\s+/, "")
    .replace(new RegExp(`^${manufacturer}\\s*`, "i"), "")
    .replace(/,?\s*SN\s+[\w-]+.*$/i, "")
    .replace(/\s+with\s+.*$/i, "")
    .replace(/\s+in\s+(Box|Hard Case).*$/i, "")
    .trim();

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|barrel assembly/i.test(t)
      ? "rifle"
      : "handgun";

  const condition = /never fired|new in box|unfired/i.test(t) ? "new" : "used";

  return { manufacturer, model, caliber, category, condition };
}

async function evaluate(gun, bid) {
  const body = {
    manufacturer: gun.manufacturer,
    model: gun.model,
    caliber: gun.caliber,
    category: gun.category,
    condition: gun.condition,
    targetAcquisitionCost: bid,
    autoComps: true,
    targetProfit: TARGET_PROFIT,
    buyerPremiumPct: PREMIUM,
    inboundShip: INBOUND,
  };
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) return { error: typeof j.error === "string" ? j.error : JSON.stringify(j.error) };
  const r = j.result ?? j;
  const p25 = r.scenarios?.find((s) => s.label === "P25") ?? r;
  return {
    p25Sold: r.sold?.p25 ?? null,
    soldCount: r.sold?.count ?? 0,
    verdict: p25.verdict ?? r.verdict,
    maxBid: p25.maxBid ?? r.maxBid,
    netProfit: p25.netProfit ?? r.netProfit,
    marginPct: p25.marginPct ?? r.marginPct,
    dealerFloor: j.dealerFloor ?? j.insights?.dealerFloor ?? null,
    gba: j.sourceStatus?.gba ?? null,
  };
}

async function main() {
  const allLots = [];
  for (let p = 1; p <= 9; p++) {
    try {
      const lots = await fetchPage(p);
      console.error(`Page ${p}: ${lots.length} lots`);
      allLots.push(...lots);
    } catch (e) {
      console.error(`Page ${p} failed:`, e.message);
    }
  }

  const seen = new Set();
  const unique = allLots.filter((l) => {
    if (seen.has(l.lot)) return false;
    seen.add(l.lot);
    return !["0", "00", "000"].includes(l.lot);
  });

  const results = [];
  for (const lot of unique) {
    const gun = parseGun(lot.title);
    if (!gun) {
      results.push({ ...lot, skip: "non-gun or unparseable" });
      continue;
    }
    const ev = await evaluate(gun, lot.bid);
    const walkAway =
      ev.maxBid != null && ev.dealerFloor != null
        ? Math.min(ev.maxBid, ev.dealerFloor)
        : ev.maxBid;
    const headroom = walkAway != null ? walkAway - lot.bid : null;
    results.push({
      lot: lot.lot,
      title: lot.title,
      bid: lot.bid,
      ...gun,
      ...ev,
      walkAway,
      headroom,
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  const go = results
    .filter((r) => r.verdict === "GO" && !r.error)
    .sort((a, b) => (b.headroom ?? -999) - (a.headroom ?? -999));
  const watch = results
    .filter((r) => r.verdict === "NO-GO" && r.headroom != null && r.headroom > -50 && !r.error)
    .sort((a, b) => (b.headroom ?? -999) - (a.headroom ?? -999));

  console.log(
    JSON.stringify(
      {
        assumptions: { premium: PREMIUM, inbound: INBOUND, targetProfit: TARGET_PROFIT, anchor: "P25" },
        totalLots: unique.length,
        evaluated: results.filter((r) => !r.skip).length,
        goCount: go.length,
        go: go.slice(0, 40),
        nearMiss: watch.slice(0, 15),
        noComps: results.filter((r) => r.soldCount === 0 && !r.skip).slice(0, 20),
        errors: results.filter((r) => r.error).slice(0, 10),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
