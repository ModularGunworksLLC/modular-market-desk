/**
 * Run Montana firearms through POST /api/batch on Market Desk.
 * Usage: node scripts/montana-batch.mjs
 * Env: DESK_BASE (default https://desk.modulargunworks.com)
 */
import { readFileSync, writeFileSync } from "fs";

const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";
/** Montana #46223 — National Auction USA. Card = 15.5% BP only; cash/check gets 3.5% off invoice. */
const BP_PCT = 15.5;
/** Paying by card (online default): hammer × (1 + BP). No separate CC surcharge. */
const CARD_PREMIUM_PCT = BP_PCT;
const CASH_DISCOUNT_PCT = 3.5;
/** hammer × 1.155 × 0.965 — only if paying cash/check in Billings */
const CASH_EFFECTIVE_MULT = (1 + BP_PCT / 100) * (1 - CASH_DISCOUNT_PCT / 100);
const TARGET = 50;
const INBOUND_HANDGUN = Number(process.env.MONTANA_INBOUND_HANDGUN ?? 45);
const INBOUND_LONG = Number(process.env.MONTANA_INBOUND_LONG ?? 55);

function inboundForCategory(category) {
  return category === "handgun" ? INBOUND_HANDGUN : INBOUND_LONG;
}

const firearms = JSON.parse(readFileSync("scripts/montana-firearms.json", "utf8"));

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGun(title) {
  const t = decode(title);

  const caliberMatch = t.match(
    /\b(\d{1,2}\s*[Gg]auge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|Win Short Mag|WSM|x19|mm|PRC)|9mm|9MM|10mm|10MM|22LR|22 Cal|44 Magnum|44 Mag|357 Magnum|45 Colt|45-Auto|45 ACP|5\.56|223|410|7mm|6\.5|300 Win|30-06|270 WIN|270 WSM|7\.62)\b/i,
  );
  let caliber = caliberMatch ? caliberMatch[1].replace(/\s+/g, " ") : "";
  if (/300 PRC/i.test(t)) caliber = "300 PRC";
  if (/6\.5 PRC/i.test(t)) caliber = "6.5 PRC";
  if (/7mm PRC/i.test(t)) caliber = "7mm PRC";
  if (/7mm REM MAG/i.test(t)) caliber = "7mm Rem Mag";
  if (/30-06|30 06 SPRG/i.test(t)) caliber = "30-06";
  if (/7\.62x39/i.test(t)) caliber = "7.62x39mm";
  if (/\.17 HM2/i.test(t)) caliber = "17 HM2";

  const patterns = [
    ["Christensen Arms", /Christensen Arms/i],
    ["Smith & Wesson", /Smith\s*&\s*Wesson/i],
    ["Springfield", /Springfield/i],
    ["Century Arms", /Century Arms/i],
    ["American Tactical", /American Tatical|American Tactical/i],
    ["Black Rain Ordnance", /Black Rain/i],
    ["Diamondback", /Diamond Back|Diamondback/i],
    ["Hi-Point", /Hi\s*[-]?\s*Point/i],
    ["Rock Island Armory", /\bRIA\b/i],
    ["Kel-Tec", /Kel\s*[-]?\s*Tec/i],
    ["DPMS", /DPMS|Panther Arms/i],
    ["Anderson", /Anderson/i],
    ["Browning", /Browning/i],
    ["Bergara", /Bergara/i],
    ["Ruger", /Ruger/i],
    ["Savage", /Savage/i],
    ["Tikka", /Tikka/i],
    ["Henry", /Henry/i],
    ["Marlin", /Marlin/i],
    ["Mossberg", /Mossberg/i],
    ["Beretta", /Beretta/i],
    ["Stoeger", /Stoeger/i],
    ["Taurus", /Taurus/i],
    ["Chiappa", /Chiappa/i],
    ["Winchester", /Winchester|Model 70/i],
    ["Howa", /Vanguard/i],
    ["Panzer", /Panzer/i],
    ["Tokarev", /Tokarev/i],
    ["AIA", /\bAIA\b/i],
  ];

  let manufacturer = "";
  for (const [name, re] of patterns) {
    if (re.test(t)) {
      manufacturer = name;
      break;
    }
  }
  if (!manufacturer && /^\.270 Winchester/i.test(t)) manufacturer = "Winchester";
  if (!manufacturer) return null;

  let model = t
    .replace(new RegExp(`^${manufacturer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/,?\s*SN\s+[\w-]+.*$/i, "")
    .replace(/\s+\d{1,2}[A-Z]{0,3}\d{5,}.*$/i, "")
    .replace(/\s+with\s+.*$/i, "")
    .replace(/\s+in\s+(Box|Hard Case|original case).*$/i, "")
    .replace(/\s+Comes in original case.*$/i, "")
    .trim();

  // Short model keys for GBA search
  if (manufacturer === "Taurus" && /G2C/i.test(t)) model = "G2C";
  else if (manufacturer === "Taurus" && /G3C/i.test(t)) model = "G3C";
  else if (manufacturer === "Taurus" && /TH10/i.test(t)) model = "TH10";
  else if (manufacturer === "Taurus" && /Judge/i.test(t)) model = "Judge";
  else if (manufacturer === "Taurus" && /PT111|MILLENNIUM/i.test(t)) model = "PT111 G2";
  else if (manufacturer === "Taurus" && /PT24\/7/i.test(t)) model = "PT24/7";
  else if (manufacturer === "Ruger" && /10\/22|10-22/i.test(t)) model = "10/22";
  else if (manufacturer === "Ruger" && /Mark II/i.test(t)) model = "Mark II";
  else if (manufacturer === "Ruger" && /LC9/i.test(t)) model = "LC9";
  else if (manufacturer === "Ruger" && /American/i.test(t)) model = "American";
  else if (manufacturer === "Ruger" && /Hawkeye/i.test(t)) model = "Hawkeye";
  else if (manufacturer === "Smith & Wesson" && /M&P-15|M&P 15/i.test(t)) model = "M&P15";
  else if (manufacturer === "Smith & Wesson" && /Model 29|\.44 Mag 29/i.test(t)) model = "Model 29";
  else if (manufacturer === "Smith & Wesson" && /SP.?22|Walther SP/i.test(t)) model = "SW22";
  else if (manufacturer === "Springfield" && /XD-40/i.test(t)) model = "XD-40";
  else if (manufacturer === "Springfield" && /\bXD\b/i.test(t)) model = "XD";
  else if (manufacturer === "Mossberg" && /500A|500 A/i.test(t)) model = "500";
  else if (manufacturer === "Mossberg" && /835/i.test(t)) model = "835";
  else if (manufacturer === "Mossberg" && /715T/i.test(t)) model = "715T";
  else if (manufacturer === "Hi-Point" && /4595/i.test(t)) model = "4595";
  else if (manufacturer === "Hi-Point" && /1095/i.test(t)) model = "1095";
  else if (manufacturer === "Hi-Point" && /4095/i.test(t)) model = "4095";
  else if (manufacturer === "Hi-Point" && /995/i.test(t)) model = "995";
  else if (manufacturer === "Hi-Point" && /JCP/i.test(t)) model = "JCP";
  else if (manufacturer === "Hi-Point" && /JHP/i.test(t)) model = "JHP";
  else if (manufacturer === "Anderson" && /AM-15/i.test(t)) model = "AM-15";
  else if (manufacturer === "Browning" && /X-Bolt/i.test(t)) model = "X-Bolt";
  else if (manufacturer === "Browning" && /\bAB3\b/i.test(t)) model = "AB3";
  else if (manufacturer === "Christensen Arms" && /EVOKE/i.test(t)) model = "Evoke";
  else if (manufacturer === "Century Arms" && /C39V2/i.test(t)) model = "C39V2";
  else if (manufacturer === "Century Arms" && /C308/i.test(t)) model = "C308";
  else if (manufacturer === "Century Arms" && /CETME/i.test(t)) model = "CETME";
  else if (manufacturer === "Chiappa" && /1911-22/i.test(t)) model = "1911-22";
  else if (manufacturer === "Black Rain Ordnance" && /Spec15|Patriot/i.test(t)) model = "Spec15";
  else if (manufacturer === "Kel-Tec" && /Sub 200/i.test(t)) model = "Sub-2000";
  else if (manufacturer === "Kel-Tec" && /RDB/i.test(t)) model = "RDB";
  else if (manufacturer === "Stoeger" && /STR-9/i.test(t)) model = "STR-9";
  else if (manufacturer === "Howa" && /Vanguard/i.test(t)) model = "Vanguard";
  else if (manufacturer === "Savage" && /Model 110|110/i.test(t)) model = "110";
  else if (manufacturer === "Savage" && /Model 10|\b10\b/i.test(t)) model = "10";
  else if (manufacturer === "Savage" && /Model 111|111/i.test(t)) model = "111";
  else if (manufacturer === "Marlin" && /70P/i.test(t)) model = "70P";
  else if (manufacturer === "Winchester" && /Model 70/i.test(t)) model = "Model 70";
  else if (manufacturer === "Beretta" && /A303/i.test(t)) model = "A303";
  else if (manufacturer === "DPMS" && /A-15/i.test(t)) model = "A-15";
  else if (manufacturer === "Diamondback" && /DB-15|DB15/i.test(t)) model = "DB15";
  else if (manufacturer === "Henry" && /Big Boy/i.test(t)) model = "Big Boy";
  else if (manufacturer === "Panzer" && /Mag 12/i.test(t)) model = "Mag 12";
  else if (manufacturer === "Tokarev" && /TAR 12/i.test(t)) model = "TAR 12";
  else if (manufacturer === "Tokarev" && /TBP12/i.test(t)) model = "TBP12";
  else if (/\bVR80\b/i.test(t)) {
    manufacturer = "Rock Island Armory";
    model = "VR80";
  } else {
    model = model.split(/\s+/).slice(0, 4).join(" ").trim();
  }

  if (!model) return null;

  const category = /shotgun|gauge|TAR 12|TBP12|VR80|Mag 12|500|835|5500|A303|Condor|311|1011/i.test(
    t,
  )
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|AR-?15|M&P\s*15|AM-15|A-15|DB-?15|10\/22|Bolt Action|Evoke|X-Bolt|American|110|111|10\b|70P|715T|C39|C308|CETME|Big Boy|Vanguard|B-14|Model 70|Hawkeye|Sub-2000|RDB|Spec15|Patriot|Alpha Maxx|OMNI/i.test(
        t,
      )
      ? "rifle"
      : "handgun";

  return { manufacturer, model, caliber, category };
}

const rows = [];
const skipped = [];

for (let i = 0; i < firearms.length; i++) {
  const f = firearms[i];
  const gun = parseGun(f.title);
  if (!gun) {
    skipped.push({ lot: f.lot, title: f.title, bid: f.bid });
    continue;
  }
  rows.push({
    rowNumber: i + 1,
    lot: f.lot,
    manufacturer: gun.manufacturer,
    model: gun.model,
    caliber: gun.caliber,
    category: gun.category,
    currentBid: f.bid,
    buyerPremiumPct: CARD_PREMIUM_PCT,
    inboundShip: inboundForCategory(gun.category),
  });
}

console.log(`Parsed ${rows.length} evaluable / ${skipped.length} skipped`);
if (skipped.length) {
  console.log("\nSkipped (could not parse make/model):");
  for (const s of skipped) console.log(`  Lot ${s.lot}: ${s.title.slice(0, 70)}`);
}

const body = { rows, defaults: { condition: "used", buyerPremiumPct: CARD_PREMIUM_PCT, targetProfit: TARGET } };

const shipMix = rows.reduce(
  (a, r) => {
    a[r.category === "handgun" ? "handgun" : "long"]++;
    return a;
  },
  { handgun: 0, long: 0 },
);

console.log(`\nPosting ${rows.length} lots to ${DESK}/api/batch ...`);
console.log(
  `Montana terms: ${BP_PCT}% BP on card (×${(1 + BP_PCT / 100).toFixed(4)}), cash/check −${CASH_DISCOUNT_PCT}% on invoice (×${CASH_EFFECTIVE_MULT.toFixed(4)}),`,
);
console.log(
  `  ship $${INBOUND_HANDGUN} handgun (${shipMix.handgun}) / $${INBOUND_LONG} long (${shipMix.long}), $${TARGET} target @ P25\n`,
);

async function runBatch(batchRows, inboundShip) {
  const res = await fetch(`${DESK}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: batchRows,
      defaults: {
        condition: "used",
        buyerPremiumPct: CARD_PREMIUM_PCT,
        inboundShip,
        targetProfit: TARGET,
        minMarginPct: 0,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Batch failed (${inboundShip} ship): ${res.status} ${await res.text()}`);
  }
  const out = [];
  const text = await res.text();
  for (const line of text.split("\n").filter(Boolean)) {
    const evt = JSON.parse(line);
    if (evt.type === "meta") console.log(`GBA token (${inboundShip} ship batch):`, evt.hasToken ? "yes" : "MISSING");
    if (evt.type === "result") out.push(evt.row);
    if (evt.type === "done") console.log(`Completed ${evt.completed} @ $${inboundShip} inbound`);
  }
  return out;
}

const handguns = rows.filter((r) => r.category === "handgun");
const longs = rows.filter((r) => r.category !== "handgun");

const results = [];
if (handguns.length) results.push(...(await runBatch(handguns, INBOUND_HANDGUN)));
if (longs.length) results.push(...(await runBatch(longs, INBOUND_LONG)));

results.sort((a, b) => Number(a.lot) - Number(b.lot));

const go = results.filter((r) => r.verdict === "GO");
const nogo = results.filter((r) => r.verdict === "NO-GO");
const nocomps = results.filter((r) => !r.verdict && !r.error);
const errors = results.filter((r) => r.error);

console.log(`\n=== SUMMARY: ${go.length} GO | ${nogo.length} NO-GO | ${nocomps.length} no comps | ${errors.length} errors ===\n`);

console.log("=== GO (ranked by headroom) ===");
for (const r of [...go].sort((a, b) => (b.headroom ?? 0) - (a.headroom ?? 0))) {
  console.log(
    `Lot ${r.lot} bid $${r.currentBid} | walk $${r.walkAway} | headroom $${r.headroom} | P25 $${r.soldP25} | net $${r.netProfit} | ${r.label}`,
  );
}

console.log("\n=== NO-GO with comps (closest first) ===");
for (const r of [...nogo]
  .filter((x) => x.soldCount > 0)
  .sort((a, b) => (b.netProfit ?? -999) - (a.netProfit ?? -999))
  .slice(0, 20)) {
  console.log(
    `Lot ${r.lot} bid $${r.currentBid} | max $${r.maxBid} | net $${r.netProfit} | P25 $${r.soldP25} | ${r.label}`,
  );
}

const terms = {
  auction: "Montana Sporting #46223",
  bpPct: BP_PCT,
  cardPremiumPct: CARD_PREMIUM_PCT,
  cashDiscountPct: CASH_DISCOUNT_PCT,
  paymentNote: "Card = hammer × 1.155 + ship. Cash/check = hammer × 1.1146 + ship.",
  inboundHandgun: INBOUND_HANDGUN,
  inboundLong: INBOUND_LONG,
  targetProfit: TARGET,
  sellAnchor: "P25",
};

writeFileSync(
  "scripts/montana-buy-sheet.json",
  JSON.stringify({ terms, results, skipped, rows }, null, 2),
);
writeFileSync(
  "scripts/montana-buy-sheet.csv",
  [
    "lot,bid,category,inboundShip,verdict,maxBid,walkAway,headroom,netProfit,soldP25,soldCount,dealerFloor,label,error",
    ...results.map(
      (r) =>
        [
          r.lot,
          r.currentBid,
          r.category ?? "",
          rows.find((x) => x.lot === r.lot)?.inboundShip ?? "",
          r.verdict ?? "",
          r.maxBid ?? "",
          r.walkAway ?? "",
          r.headroom ?? "",
          r.netProfit ?? "",
          r.soldP25 ?? "",
          r.soldCount,
          r.dealerFloor ?? "",
          `"${(r.label ?? "").replace(/"/g, '""')}"`,
          r.error ?? "",
        ].join(","),
    ),
  ].join("\n"),
);
console.log("\nWrote scripts/montana-buy-sheet.json and scripts/montana-buy-sheet.csv");
