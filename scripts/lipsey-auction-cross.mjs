/**
 * Cross-reference Pearce auction inventory vs Lipsey dealer CSV export.
 */
import fs from "fs";
import { parse } from "csv-parse/sync";
import XLSX from "xlsx";

const LIPSEY =
  "C:/Users/micha/Downloads/Lipsey's-Catalog-05-06-2026,_13-12-19.csv";
const INVENTORY =
  "C:/Users/micha/OneDrive/Desktop/auction_inventory._restored.xlsx";

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseGun(title, category) {
  const t = String(title ?? "").replace(/\s+/g, " ").trim();
  if (
    /silver|coin|sterling|ammo|round|grain|qty:|\/box|knife|bow|crossbow|magazine lot/i.test(
      t,
    )
  )
    return null;

  const caliberMatch = t.match(
    /\b(\d{1,2}\s*Gauge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|x19|mm)|9mm|10mm|22LR|22 Cal|44 Magnum|357 Magnum|45 Colt|45-Auto|5\.56|223|410)\b/i,
  );
  const caliber = caliberMatch ? caliberMatch[1].replace(/\s+/g, " ") : "";

  const brands = [
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
    ["Kriss USA", /^Kriss\b/i],
    ["Barrett Firearms", /^Barrett\b/i],
    ["Tikka", /^Tikka\b/i],
    ["Chiappa Firearms", /^Chiappa\b/i],
  ];

  let manufacturer = "";
  for (const [name, re] of brands) {
    if (re.test(t)) {
      manufacturer = name;
      break;
    }
  }
  if (!manufacturer) return null;

  let model = t
    .replace(/^Never Fired\s+/i, "")
    .replace(/^\d{4}\s+/, "")
    .replace(
      new RegExp(`^${manufacturer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"),
      "",
    )
    .replace(/,?\s*SN\s+[\w-]+.*$/i, "")
    .replace(/\s+with\s+.*$/i, "")
    .replace(/\s+in\s+(Box|Hard Case).*$/i, "")
    .replace(/\bPmm\b/i, "9mm")
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

  const cat = /shotgun|gauge/i.test(t) || /shotgun/i.test(category)
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|barrel assembly|AR-?15|M&P\s*15/i.test(t) ||
        /rifle/i.test(category)
      ? "rifle"
      : "handgun";

  return { manufacturer, model, caliber, category: cat };
}

function isFirearm(row) {
  const itemType = String(row.ITEMTYPE ?? "").toLowerCase();
  const type = String(row.TYPE ?? "").toLowerCase();
  if (itemType === "firearm") return true;
  return /pistol|rifle|shotgun|revolver|carbine|firearm/i.test(type) && itemType !== "optic";
}

function scoreMatch(gun, row) {
  const mfr = norm(row.MANUFACTURER);
  const qMfr = norm(gun.manufacturer);
  if (!mfr.includes(qMfr.replace(/&/g, "")) && !qMfr.includes(mfr.replace(/&/g, ""))) {
    if (qMfr === "smithwesson" && !mfr.includes("smith")) return 0;
    if (qMfr === "sig sauer" && !mfr.includes("sig")) return 0;
    if (qMfr === "hk" && mfr !== "hk" && !mfr.includes("heckler")) return 0;
    if (qMfr !== mfr && !mfr.includes(qMfr) && !qMfr.includes(mfr)) return 0;
  }

  const hay = norm(`${row.MANUFACTURER} ${row.MODEL} ${row.DESCRIPTION1} ${row.DESCRIPTION2}`);
  const modelTokens = gun.model
    .toLowerCase()
    .split(/[\s\-\/]+/)
    .filter((t) => t.length > 1);

  let score = 30;
  for (const tok of modelTokens) {
    const nt = norm(tok);
    if (nt.length < 2) continue;
    if (hay.includes(nt)) score += 18;
  }

  if (gun.caliber) {
    const cal = norm(gun.caliber);
    const rowCal = norm(row.CALIBERGAUGE);
    if (rowCal && (rowCal.includes(cal) || cal.includes(rowCal))) score += 15;
  }

  // Penalize variant drift (Carry, Rival, Elite when not in query)
  const qHay = gun.model.toLowerCase();
  if (/\bcarry\b/i.test(hay) && !/\bcarry\b/i.test(qHay)) score -= 25;
  if (/\brival\b/i.test(hay) && !/\brival\b/i.test(qHay)) score -= 25;
  if (/\belite\b/i.test(hay) && !/\belite\b/i.test(qHay)) score -= 15;
  if (/\bmete\b/i.test(hay) && /\bmc9\b/i.test(qHay) && /\bsfx\b/i.test(hay)) score -= 30;
  if (/\bsfx\b/i.test(hay) && /\bsf\b/i.test(qHay) && !/\bsfx\b/i.test(qHay)) score -= 35;
  if (/\btp9sf\b/i.test(hay) && /\bsfx\b/i.test(qHay)) score -= 40;
  if (/\btp9sfx\b/i.test(hay) && /\bsf\b/i.test(qHay) && !/\bsfx\b/i.test(qHay)) score -= 40;

  // Parts/mags in description
  if (/magazine|barrel only|slide only|receiver|parts? kit/i.test(`${row.DESCRIPTION1} ${row.TYPE}`))
    return 0;

  return score;
}

const lipseyRaw = fs.readFileSync(LIPSEY, "utf8");
const lipseyRows = parse(lipseyRaw, { columns: true, skip_empty_lines: true, relax_column_count: true });
const firearms = lipseyRows.filter(isFirearm).map((r) => ({
  ...r,
  dealerPrice: Number(r.CURRENTPRICE || r.PRICE) || null,
}));

console.error(`Lipsey rows: ${lipseyRows.length}, firearms: ${firearms.length}`);

const wb = XLSX.readFile(INVENTORY);
const inv = XLSX.utils.sheet_to_json(wb.Sheets["auction_inventory"]);

const results = [];
for (const row of inv) {
  const gun = parseGun(row["Item Description"], row.Category);
  if (!gun) continue;

  const hammer = Number(row["Current Bid"]) || 0;
  const maxHammer = Number(row["Max Hammer Bid"]) || 0;
  const p25 = Number(row["GunBroker Est Value Min"]) || 0;

  const scored = firearms
    .map((lr) => ({ lr, score: scoreMatch(gun, lr) }))
    .filter((x) => x.score >= 55)
    .sort((a, b) => b.score - a.score || (a.lr.dealerPrice ?? 9999) - (b.lr.dealerPrice ?? 9999));

  const best = scored[0]?.lr ?? null;
  const dealer = best?.dealerPrice ?? null;
  const cheaperThanHammer = dealer != null && hammer > 0 && dealer < hammer;

  results.push({
    lot: row.Lot,
    desc: row["Item Description"],
    mfr: gun.manufacturer,
    model: gun.model,
    hammer,
    maxHammer,
    p25,
    lipseyDealer: dealer,
    lipseySku: best?.ITEMNO ?? null,
    lipseyModel: best ? `${best.MODEL} (${best.DESCRIPTION1?.slice(0, 40) ?? ""})` : null,
    lipseyScore: scored[0]?.score ?? 0,
    dealerFloorHit: cheaperThanHammer,
    altCount: scored.length,
    secondDealer: scored[1]?.lr?.dealerPrice ?? null,
  });
}

results.sort((a, b) => {
  if (a.dealerFloorHit !== b.dealerFloorHit) return a.dealerFloorHit ? -1 : 1;
  if (a.lipseyDealer && b.lipseyDealer) return a.lipseyDealer - b.lipseyDealer;
  return a.lot - b.lot;
});

console.log("\n=== DEALER FLOOR HITS (Lipsey new cheaper than live hammer) ===\n");
const hits = results.filter((r) => r.dealerFloorHit);
if (hits.length === 0) console.log("None");
else
  for (const r of hits) {
    console.log(
      `Lot ${r.lot}: hammer $${r.hammer} > Lipsey $${r.lipseyDealer} | ${r.mfr} ${r.model} | ${r.lipseySku} ${r.lipseyModel}`,
    );
  }

console.log("\n=== CANIK LOTS ===\n");
for (const r of results.filter((x) => x.mfr === "Canik")) {
  console.log(
    `Lot ${r.lot} | ${r.model} | hammer $${r.hammer} | walk $${r.maxHammer} | P25 $${r.p25} | Lipsey $${r.lipseyDealer ?? "—"} | ${r.lipseySku ?? ""} | floor=${r.dealerFloorHit ? "HIT" : "ok"}`,
  );
  if (r.lipseyModel) console.log(`  match: ${r.lipseyModel} (score ${r.lipseyScore})`);
}

console.log("\n=== AUCTION GUNS WITH LIPSEY MATCH (hammer within $100 of dealer) ===\n");
for (const r of results.filter(
  (x) => x.lipseyDealer != null && x.hammer > 0 && x.hammer >= x.lipseyDealer - 100,
)) {
  const gap = r.hammer - r.lipseyDealer;
  console.log(
    `Lot ${r.lot} | ${r.mfr} ${r.model} | hammer $${r.hammer} | Lipsey $${r.lipseyDealer} | gap ${gap >= 0 ? "+" : ""}${gap.toFixed(0)} | walk $${r.maxHammer} | ${r.dealerFloorHit ? "FLOOR HIT" : "ok"}`,
  );
}

console.log("\n=== SUMMARY ===");
console.log(`Mapped guns: ${results.length}`);
console.log(`With Lipsey match: ${results.filter((r) => r.lipseyDealer).length}`);
console.log(`Dealer floor hits: ${hits.length}`);
