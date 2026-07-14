import { readFileSync, writeFileSync } from "fs";

const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";
const PREMIUM = 18.5;
const INBOUND = 0;
const TARGET_PROFIT = 50;

const lots = JSON.parse(readFileSync("scripts/pearce-lots.json", "utf8"));

function parseGun(title) {
  const t = title.replace(/\s+/g, " ").trim();
  if (/silver|coin|sterling|ammo|knife|bow|crossbow|magazine lot|holster only/i.test(t))
    return null;

  const caliberMatch = t.match(
    /\b(\d{1,2}\s*Gauge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|x19|mm)|9mm|10mm|22LR|22 Cal|38 Cal|44 Magnum|357 Magnum|45 Colt|45-Auto|5\.56|223|410)\b/i,
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
    ["Tippmann", /^Tippmann\b/i],
    ["Good Times Outdoors", /^Good Times Outdoors\b/i],
    ["Adler Arms", /^Adler Arms\b/i],
    ["G Force Arms", /^G Force Arms\b/i],
    ["Black Aces Tactical", /^Black Aces Tactical\b/i],
    ["Radikal Arms", /^Radikal Arms\b/i],
    ["Tokarev", /^Tokarev\b/i],
    ["SDS", /^SDS\b/i],
    ["Silver Eagle", /^Silver Eagle\b/i],
    ["Sig Sauer", /^Sig\s*Sauer\b/i],
    ["Springfield", /^Springfield\b/i],
    ["CZ", /^CZ\b/i],
    ["Mossberg", /^Mossberg\b/i],
    ["Savage", /^Savage\b/i],
    ["Henry", /^Henry\b/i],
    ["Marlin", /^Marlin\b/i],
    ["Benelli", /^Benelli\b/i],
    ["FN", /^FN\b/i],
    ["Canik", /^Canik\b/i],
    ["Taurus", /^Taurus\b/i],
    ["Heritage", /^Heritage\b/i],
    ["Diamondback", /^Diamondback\b/i],
    ["PSA", /^PSA\b|Palmetto/i],
    ["Anderson", /^Anderson\b/i],
    ["Aero Precision", /^Aero Precision\b/i],
    ["Daniel Defense", /^Daniel Defense\b/i],
    ["BCM", /^BCM\b|Bravo Company/i],
    ["IWI", /^IWI\b/i],
    ["Century Arms", /^Century Arms\b/i],
    ["Zastava", /^Zastava\b/i],
    ["Stoeger", /^Stoeger\b/i],
    ["TriStar", /^TriStar\b/i],
    ["Citadel", /^Citadel\b/i],
    ["Citadel", /^Citadel\b/i],
    ["Weatherby", /^Weatherby\b/i],
    ["Bergara", /^Bergara\b/i],
    ["Howa", /^Howa\b/i],
    ["Christensen", /^Christensen\b/i],
    ["Christensen Arms", /^Christensen Arms\b/i],
    ["Bushmaster", /^Bushmaster\b/i],
    ["DPMS", /^DPMS\b/i],
    ["Windham", /^Windham\b/i],
    ["Ruger", /^Ruger\b/i],
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
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|barrel assembly|AR-?15|M&P 15/i.test(t)
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
  const dealerFloor =
    j.insights?.cheapestInStockDealer?.dealerPrice ??
    j.wholesale?.cheapestDealerPrice ??
    null;
  return {
    p25Sold: r.sold?.p25 ?? null,
    soldCount: r.sold?.count ?? 0,
    verdict: p25.verdict ?? r.verdict,
    maxBid: p25.maxBid ?? r.maxBid,
    netProfit: p25.netProfit ?? r.netProfit,
    marginPct: p25.marginPct ?? r.marginPct,
    dealerFloor,
    gba: j.sourceStatus?.gba ?? null,
  };
}

async function evalLot(lot) {
  const gun = parseGun(lot.title);
  if (!gun) return { ...lot, skip: true };
  const ev = await evaluate(gun, lot.bid ?? 0);
  const walkAway =
    ev.maxBid != null && ev.dealerFloor != null
      ? Math.min(ev.maxBid, ev.dealerFloor)
      : ev.maxBid;
  return {
    lot: lot.lot,
    title: lot.title,
    bid: lot.bid,
    ...gun,
    ...ev,
    walkAway,
    headroom: walkAway != null && lot.bid != null ? walkAway - lot.bid : null,
  };
}

const CONCURRENCY = 4;
const results = [];
let done = 0;
for (let i = 0; i < lots.length; i += CONCURRENCY) {
  const batch = lots.slice(i, i + CONCURRENCY);
  const batchRes = await Promise.all(batch.map(evalLot));
  results.push(...batchRes);
  done += batch.length;
  process.stderr.write(`evaluated ${done}/${lots.length}\n`);
}

const go = results
  .filter((r) => r.verdict === "GO" && !r.error)
  .sort((a, b) => (b.headroom ?? -999) - (a.headroom ?? -999));
const near = results
  .filter(
    (r) =>
      r.verdict === "NO-GO" &&
      r.headroom != null &&
      r.headroom > -75 &&
      r.soldCount > 0 &&
      !r.error,
  )
  .sort((a, b) => (b.headroom ?? -999) - (a.headroom ?? -999));

const out = {
  assumptions: {
    premium: PREMIUM,
    inbound: INBOUND,
    targetProfit: TARGET_PROFIT,
    anchor: "P25 sold (conservative)",
    note: "Auction lists 15% premium; analysis uses your 18.5%",
  },
  totalLots: lots.length,
  gunLots: results.filter((r) => !r.skip).length,
  goCount: go.length,
  go,
  nearMiss: near.slice(0, 25),
  overBid: results
    .filter((r) => r.headroom != null && r.headroom < 0 && r.soldCount > 0)
    .sort((a, b) => a.headroom - b.headroom)
    .slice(0, 15),
  noComps: results.filter((r) => r.soldCount === 0 && !r.skip).slice(0, 20),
};
writeFileSync("scripts/pearce-results.json", JSON.stringify(out, null, 2));
process.stderr.write(`done: ${go.length} GO of ${results.filter((r) => !r.skip).length} guns\n`);
