/**
 * Sync auction_inventory..xlsx:
 * - Current Bid = live Pearce high bid
 * - My Current Bid = your active bids (where known)
 * - Max Hammer Bid = desk walk-away (18.5% premium, $50 profit, P25 exit)
 * - GB Min/Max = P25 / Median sold comps
 */
import XLSX from "xlsx";
import { writeFileSync } from "fs";

const XLSX_PATH = "C:/Users/micha/OneDrive/Desktop/auction_inventory..xlsx";
const DESK = "https://desk.modulargunworks.com";
const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const PREMIUM = 18.5;
const TARGET = 50;

/** Your bids from last session — update when you rebid */
const MY_BIDS = {
  19: 225,
  82: 65,
  94: 150,
  95: 40,
  96: 30,
  97: 55,
  135: 70,
  308: 7,
  344: 10,
};

function decode(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseGun(title) {
  const t = decode(title);
  if (!t) return null;
  if (/silver|coin|sterling|ammo|round|grain|qty:|\/box|knife|bow|crossbow|magazine lot/i.test(t))
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
    ["Weatherby", /^Weatherby\b/i],
    ["Bergara", /^Bergara\b/i],
    ["Howa", /^Howa\b/i],
    ["Christensen Arms", /^Christensen Arms\b/i],
    ["Bushmaster", /^Bushmaster\b/i],
    ["DPMS", /^DPMS\b/i],
    ["Windham", /^Windham\b/i],
    ["Citadel", /^Citadel\b/i],
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
    .replace(/\bPmm\b/i, "9mm")
    .trim();

  if (manufacturer === "Smith & Wesson" && /M&P\s*15/i.test(t)) {
    model = "M&P15";
  }
  if (manufacturer === "Smith & Wesson" && /M&P\s*45/i.test(t)) {
    model = "M&P45";
  }

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|barrel assembly|AR-?15|M&P\s*15/i.test(t)
      ? "rifle"
      : "handgun";

  const condition = /never fired|new in box|unfired/i.test(t) ? "new" : "used";

  return { manufacturer, model, caliber, category, condition, key: `${manufacturer}|${model}|${caliber}|${category}|${condition}` };
}

async function fetchLiveBids() {
  const map = new Map();
  for (let page = 1; page <= 6; page++) {
    const url = `${AUCTION}?page=${page}&pageSize=100`;
    const html = await (await fetch(url)).text();
    const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
    let block;
    while ((block = cardRe.exec(html)) !== null) {
      const chunk = block[0];
      const lot = block[1];
      const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
      if (bidM) map.set(String(lot), parseFloat(bidM[1].replace(/,/g, "")));
    }
    if (page > 1 && map.size < (page - 1) * 50) break;
  }
  return map;
}

const evalCache = new Map();

function outboundForCategory(category) {
  const c = String(category).toLowerCase();
  if (/rifle|shotgun/.test(c)) return 60;
  return 45;
}

async function deskEval(gun, category) {
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
    outboundShip: outboundForCategory(category),
  };
  try {
    const res = await fetch(`${DESK}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    const r = j.result ?? j;
    const sold = r.sold ?? {};
    const p25s = r.scenarios?.find((s) => s.label === "P25");
    const out = {
      p25: sold.p25 ?? null,
      median: sold.median ?? null,
      maxHammer: p25s?.maxBid ?? null,
      soldCount: sold.count ?? 0,
      gba: j.sourceStatus?.gba ?? "",
    };
    evalCache.set(gun.key, out);
    return out;
  } catch {
    const out = { p25: null, median: null, maxHammer: null, soldCount: 0, gba: "error" };
    evalCache.set(gun.key, out);
    return out;
  }
}

function round2(n) {
  return n == null || Number.isNaN(n) ? "" : Math.round(n * 100) / 100;
}

function note(liveBid, myBid, maxHammer, ev, gun) {
  if (!gun) return "Non-firearm or unmapped — no GB comps.";
  if (!ev.soldCount) return "No GunBroker catalog match.";
  if (maxHammer === "" || maxHammer == null) return "No max bid calc.";
  if (myBid !== "" && liveBid > myBid) return `Outbid — leader $${liveBid} (your bid $${myBid}). Max set $${maxHammer}.`;
  if (liveBid <= maxHammer) return `GO at live $${liveBid}. Set max bid $${maxHammer}.`;
  return `NO-GO — live $${liveBid} over max $${maxHammer}.`;
}

async function main() {
  console.error("Fetching live Pearce bids...");
  const live = await fetchLiveBids();
  console.error(`Live lots: ${live.size}`);

  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "" });

  const gunsNeeded = new Map();
  for (const row of rows) {
    const gun = parseGun(row["Item Description"]);
    if (gun) gunsNeeded.set(gun.key, { gun, category: row.Category ?? row.category ?? "" });
  }

  console.error(`Evaluating ${gunsNeeded.size} unique guns...`);
  const gunList = [...gunsNeeded.values()];
  const CONC = 4;
  for (let i = 0; i < gunList.length; i += CONC) {
    await Promise.all(gunList.slice(i, i + CONC).map(({ gun, category }) => deskEval(gun, category)));
    console.error(`  ${Math.min(i + CONC, gunList.length)}/${gunList.length}`);
  }

  for (const row of rows) {
    const lot = String(row.Lot);
    const liveBid = live.get(lot);
    const myBid = MY_BIDS[Number(lot)] ?? "";

    row[" Current Bid "] = liveBid ?? row[" Current Bid "] ?? "";
    row["My Current Bid"] = myBid;

    const gun = parseGun(row["Item Description"]);
    if (gun) {
      const ev =
        evalCache.get(gun.key) ?? { p25: null, median: null, maxHammer: null, soldCount: 0 };
      const maxH = round2(ev.maxHammer);
      row[" Max Hammer Bid "] = maxH;
      row[" GunBroker Est Value Min "] = round2(ev.p25);
      row[" GunBroker Est Value Max "] = round2(ev.median);
      row["Margin Notes"] = note(liveBid ?? "", myBid, maxH, ev, gun);
    } else {
      row[" Max Hammer Bid "] = "";
      row[" GunBroker Est Value Min "] = "";
      row[" GunBroker Est Value Max "] = "";
      row["Margin Notes"] = "Non-firearm or unmapped — no GB comps.";
    }
  }

  const headers = [
    "Lot",
    "Category",
    "Item Description",
    "Serial Number",
    " Current Bid ",
    "My Current Bid",
    " Max Hammer Bid ",
    " GunBroker Est Value Min ",
    " GunBroker Est Value Max ",
    "Margin Notes",
  ];

  wb.Sheets[sheet] = XLSX.utils.json_to_sheet(rows, { header: headers });

  try {
    XLSX.writeFile(wb, XLSX_PATH);
    console.error(`Wrote ${XLSX_PATH}`);
  } catch (e) {
    const fallback = XLSX_PATH.replace(".xlsx", "_synced.xlsx");
    XLSX.writeFile(wb, fallback);
    console.error(`Original locked — wrote ${fallback}`);
    process.exitCode = 1;
  }

  const mine = rows.filter((r) => MY_BIDS[Number(r.Lot)] != null);
  console.log(JSON.stringify(mine, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
