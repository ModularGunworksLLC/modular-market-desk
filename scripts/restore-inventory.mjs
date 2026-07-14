/**
 * Restore auction_inventory..xlsx from CSV backup, sync live bids + desk comps, add formulas.
 */
import ExcelJS from "exceljs";
import XLSX from "xlsx";

const CSV = "C:/Users/micha/OneDrive/Desktop/auction_inventory.csv";
const OUT = "C:/Users/micha/OneDrive/Desktop/auction_inventory..xlsx";
const DESK = "https://desk.modulargunworks.com";
const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const PREMIUM = 18.5;
const TARGET = 50;

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

const HEADERS = [
  "Lot",
  "Category",
  "Item Description",
  "Serial Number",
  "Current Bid",
  "My Current Bid",
  "Max Hammer Bid",
  "GunBroker Est Value Min",
  "GunBroker Est Value Max",
  "All-in @ Bid",
  "Est Profit @ P25",
  "Headroom",
  "Verdict",
  "Margin Notes",
];

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGun(title, category) {
  const t = decode(title);
  if (/silver|coin|sterling|ammo|round|grain|qty:|\/box|knife|bow|crossbow|magazine lot/i.test(t))
    return null;

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
    .replace(/\bPmm\b/i, "9mm")
    .trim();

  if (manufacturer === "Springfield" && /^armory\s+/i.test(model)) {
    model = model.replace(/^armory\s+/i, "");
  }
  if (caliber) {
    const calEsc = caliber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    model = model.replace(new RegExp(calEsc, "gi"), " ");
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

  const cat =
    /shotgun|gauge/i.test(t) || /shotgun/i.test(category)
      ? "shotgun"
      : /rifle|carbine|NATO|Wylde|REM\b|SPRG|barrel assembly|AR-?15|M&P\s*15/i.test(t) ||
          /rifle/i.test(category)
        ? "rifle"
        : "handgun";

  const condition = /never fired|new in box|unfired/i.test(t) ? "new" : "used";

  return {
    manufacturer,
    model,
    caliber,
    category: cat,
    condition,
    key: `${manufacturer}|${model}|${caliber}|${cat}|${condition}`,
  };
}

function outboundForCategory(category) {
  const c = String(category).toLowerCase();
  return /rifle|shotgun/.test(c) ? 60 : 45;
}

async function fetchLiveBids() {
  const map = new Map();
  for (let page = 1; page <= 6; page++) {
    const html = await (await fetch(`${AUCTION}?page=${page}&pageSize=100`)).text();
    const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
    let block;
    while ((block = cardRe.exec(html)) !== null) {
      const chunk = block[0];
      const lot = block[1];
      const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
      if (bidM) map.set(String(lot), parseFloat(bidM[1].replace(/,/g, "")));
    }
  }
  return map;
}

const evalCache = new Map();

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
    const p25s = r.scenarios?.find((s) => s.label === "P25");
    const cat = j.catalogMatch;
    const out = {
      p25: r.sold?.p25 ?? null,
      median: r.sold?.median ?? null,
      maxHammer: p25s?.maxBid ?? null,
      soldCount: r.sold?.count ?? 0,
      catalogLabel: cat
        ? `${cat.manufacturer} ${cat.model} (${cat.conditionParam}, ${cat.caliber})`
        : null,
    };
    evalCache.set(gun.key, out);
    return out;
  } catch {
    const out = { p25: null, median: null, maxHammer: null, soldCount: 0, catalogLabel: null };
    evalCache.set(gun.key, out);
    return out;
  }
}

function outboundFormula(r) {
  const cat = `B${r}`;
  return `IF(OR(ISNUMBER(SEARCH("Rifle",${cat})),ISNUMBER(SEARCH("Shotgun",${cat}))),Settings!$B$3,Settings!$B$2)`;
}

function profitFormula(r) {
  const g = `H${r}`;
  const hammer = `E${r}`;
  const out = outboundFormula(r);
  const fvf = `0.06*MIN(${g},400)+0.04*MAX(0,MIN(${g},15000)-400)`;
  const netA = `${g}-(${fvf})-5-${out}-0.03*(${g}+${out})-Settings!$B$4`;
  const netB = `${g}/1.09`;
  const allIn = `${hammer}*(1+Settings!$B$1/100)`;
  return `IF(OR(${hammer}="",${g}=""),"",ROUND(MAX(${netA},${netB})-${allIn},2))`;
}

function loadCsvRows() {
  const wb = XLSX.readFile(CSV);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  return raw.map((r) => ({
    lot: r.Lot,
    category: r.Category,
    desc: r["Item Description"],
    serial: r["Serial Number"],
    notes: r["Margin Notes"] ?? "",
  }));
}

const live = await fetchLiveBids();
console.error(`Live bids: ${live.size}`);

const rows = loadCsvRows();
console.error(`CSV rows: ${rows.length}`);

const gunsNeeded = new Map();
for (const row of rows) {
  const gun = parseGun(row.desc, row.category);
  if (gun) gunsNeeded.set(gun.key, { gun, category: row.category });
}

const gunList = [...gunsNeeded.values()];
for (let i = 0; i < gunList.length; i += 4) {
  await Promise.all(gunList.slice(i, i + 4).map(({ gun, category }) => deskEval(gun, category)));
  console.error(`Eval ${Math.min(i + 4, gunList.length)}/${gunList.length}`);
}

const wb = new ExcelJS.Workbook();
const settings = wb.addWorksheet("Settings");
settings.getCell("A1").value = "Buyer Premium %";
settings.getCell("B1").value = 18.5;
settings.getCell("A2").value = "Outbound — Handgun/Pistol $";
settings.getCell("B2").value = 45;
settings.getCell("A3").value = "Outbound — Rifle/Shotgun $";
settings.getCell("B3").value = 60;
settings.getCell("A4").value = "Listing Upgrades $";
settings.getCell("B4").value = 3;
settings.getCell("A5").value = "Target Profit $";
settings.getCell("B5").value = 50;

const ws = wb.addWorksheet("auction_inventory");
const header = ws.getRow(1);
HEADERS.forEach((h, i) => {
  const c = header.getCell(i + 1);
  c.value = h;
  c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
});

rows.forEach((row, idx) => {
  const r = idx + 2;
  const lot = String(row.lot);
  const liveBid = live.get(lot);
  const myBid = MY_BIDS[Number(lot)] ?? null;
  const gun = parseGun(row.desc, row.category);
  let maxH = null;
  let p25 = null;
  let median = null;
  let notes = row.notes;

  if (gun) {
    const ev = evalCache.get(gun.key) ?? {
      p25: null,
      median: null,
      maxHammer: null,
      soldCount: 0,
      catalogLabel: null,
    };
    maxH = ev.maxHammer;
    p25 = ev.p25;
    median = ev.median;
    const gbMatch = ev.catalogLabel ? `GBA: ${ev.catalogLabel}. ` : "";
    if (ev.soldCount === 0) notes = `${gbMatch}No GunBroker sold comps.`;
    else if (liveBid != null && maxH != null) {
      notes =
        liveBid <= maxH
          ? `${gbMatch}GO at live $${liveBid}. Walk-away $${Math.floor(maxH)}.`
          : `${gbMatch}NO-GO — live $${liveBid} over walk-away $${Math.floor(maxH)}.`;
    } else if (ev.catalogLabel) {
      notes = `${gbMatch}${ev.soldCount} sold comps.`;
    }
  } else {
    notes = "Non-firearm or unmapped — no GB comps.";
  }

  const line = ws.getRow(r);
  line.getCell(1).value = Number(row.lot);
  line.getCell(2).value = row.category;
  line.getCell(3).value = decode(row.desc);
  line.getCell(4).value = row.serial;
  line.getCell(5).value = liveBid ?? null;
  line.getCell(6).value = myBid;
  line.getCell(7).value = maxH != null ? Math.round(maxH * 100) / 100 : null;
  line.getCell(8).value = p25 != null ? Math.round(p25 * 100) / 100 : null;
  line.getCell(9).value = median != null ? Math.round(median * 100) / 100 : null;
  line.getCell(10).value = { formula: `IF(E${r}="","",ROUND(E${r}*(1+Settings!$B$1/100),2))` };
  line.getCell(11).value = { formula: profitFormula(r) };
  line.getCell(12).value = { formula: `IF(OR(E${r}="",G${r}=""),"",ROUND(G${r}-E${r},2))` };
  line.getCell(13).value = {
    formula: `IF(E${r}="","",IF(H${r}="","N/A",IF(K${r}>=Settings!$B$5,"GO","NO-GO")))`,
  };
  line.getCell(14).value = notes;

  [5, 6, 7, 8, 9, 10, 11, 12].forEach((c) => {
    line.getCell(c).numFmt = '"$"#,##0.00';
  });
  line.getCell(5).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEF9C3" },
  };
});

const lastRow = rows.length + 1;
ws.addConditionalFormatting({
  ref: `A2:N${lastRow}`,
  rules: [
    {
      type: "expression",
      priority: 1,
      formulae: ['=$M2="NO-GO"'],
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFECACA" } },
        font: { color: { argb: "FF991B1B" } },
      },
    },
    {
      type: "expression",
      priority: 2,
      formulae: ['=$M2="GO"'],
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } },
        font: { color: { argb: "FF065F46" } },
      },
    },
  ],
});

ws.views = [{ state: "frozen", ySplit: 1 }];
ws.getColumn(3).width = 44;
ws.getColumn(14).width = 48;

try {
  await wb.xlsx.writeFile(OUT);
  console.log(`Restored ${OUT} with ${rows.length} rows`);
} catch (e) {
  const fallback = OUT.replace(".xlsx", "_restored.xlsx");
  await wb.xlsx.writeFile(fallback);
  console.error(`Wrote ${fallback} — close Excel and rerun`);
}
