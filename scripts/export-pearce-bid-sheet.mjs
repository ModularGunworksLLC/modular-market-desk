/**
 * Pearce FFL flip analysis → Excel
 * Dealer view: My Max vs Rec Max, formula-driven profit as bids change.
 */
import fs from "fs";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";

const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const DESK = "https://desk.modulargunworks.com";
const LIPSEY =
  "C:/Users/micha/Downloads/Lipsey's-Catalog-05-06-2026,_13-12-19.csv";
const OUT = "C:/Users/micha/OneDrive/Desktop/pearce-bid-sheet.xlsx";

const PREMIUM = 18.5;
const TARGET = 50;
const LISTING = 3;
const MIN_SOLD = 10;
const MIN_SCORE = 50;

/** Active Pearce cart — firearms only (mags tracked separately) */
const MY_BIDS = [19, 74, 97, 135, 150, 151, 172];
const NEW_BIDS = [5, 152, 88];

/** Pre-fill "My Max Bid" from Pearce site */
const SITE_MAX = {
  19: 225,
  74: 75,
  97: 75,
  135: 125,
  150: 80,
  151: 30,
  172: 55,
};

const SITE_STATUS = {
  19: "High Bidder",
  74: "High Bidder",
  97: "High Bidder",
  135: "High Bidder",
  150: "High Bidder",
  151: "High Bidder",
  172: "High Bidder",
};

/** Column map (1-based) — keep formulas stable */
const COL = {
  lot: 1,
  gun: 2,
  section: 3,
  liveBid: 4,
  myMax: 5,
  recMax: 6,
  gap: 7,
  otdLive: 8,
  otdMyMax: 9,
  estResale: 10,
  gbNet: 11,
  profitLive: 12,
  profitMyMax: 13,
  flip: 14,
  status: 15,
  outbound: 16,
  catalog: 17,
  sold: 18,
};

const DATA_START = 5;

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
  const caliberMatch = t.match(
    /\b(\d{1,2}\s*Gauge|\.?\d{2,3}\s*(?:LR|WMR|MAG|ACP|Auto|NATO|REM|SPRG|Wylde|Win Mag|x19|mm)|9mm|10mm|22LR|22 Cal|44 Magnum|357 Magnum|45 Colt|45-Auto|5\.56|223|410)\b/i,
  );
  const caliber = caliberMatch ? caliberMatch[1].replace(/\s+/g, " ") : "";

  const patterns = [
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
    ["Winchester", /^Winchester\b/i],
    ["Savage", /^Savage\b/i],
    ["Henry", /^Henry\b/i],
    ["Marlin", /^Marlin\b/i],
    ["Mossberg", /^Mossberg\b/i],
    ["Sig Sauer", /^Sig\s*Sauer\b/i],
    ["Springfield", /^Springfield\b/i],
    ["CZ", /^CZ\b/i],
    ["Canik", /^Canik\b/i],
    ["Taurus", /^Taurus\b/i],
    ["Stoeger", /^Stoeger\b/i],
    ["Walther", /^Walther\b/i],
    ["Bond Arms", /^Bond Arms\b/i],
    ["Rossi", /^Rossi\b/i],
    ["IWI", /^IWI\b/i],
    ["Century Arms", /^Century Arms\b/i],
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
      /\b(pistol|handgun|rifle|shotgun|revolver|carbine|semi|auto|luger|magnum|gauge|guage)\b/gi,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim();

  if (manufacturer === "Smith & Wesson" && /M&P\s*15/i.test(t)) model = "M&P15";
  if (manufacturer === "Smith & Wesson" && /Model 422/i.test(t)) model = "Model 422";
  if (manufacturer === "Smith & Wesson" && /Model 915/i.test(t)) model = "Model 915";
  if (manufacturer === "Smith & Wesson" && /5903/i.test(t)) model = "5903";
  if (manufacturer === "Smith & Wesson" && /M&P\s*40/i.test(t) && /shield/i.test(t))
    model = "M&P 40 Shield";
  else if (manufacturer === "Smith & Wesson" && /M&P\s*40/i.test(t)) model = "M&P 40";
  if (manufacturer === "Remington" && /Model 1100/i.test(t)) model = "Model 1100";

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|NATO|Wylde|REM\b|SPRG|AR-?15/i.test(t)
      ? "rifle"
      : "handgun";

  const condition = /never fired|new in box|unfired/i.test(t) ? "new" : "used";

  const apiModel = model
    .replace(/\bMete\b/i, "METE")
    .replace(/\bTP9\s*SF\b/i, "TP9SF")
    .replace(/\bTP9\s*SFX\b/i, "TP9SFX")
    .replace(/\bPX4\s*Storm\b/i, "PX4 Storm")
    .replace(/\bModel 1100\b/i, "Model 1100")
    .replace(/\bSTR-9\b/i, "STR-9")
    .replace(/\bP-10M\b/i, "P-10M")
    .replace(/\bP22\b/i, "P22");

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
    const pageLots = extractLots(html);
    if (pageLots.length === 0) break;
    for (const lot of pageLots) map.set(lot.lot, lot);
  }
  return map;
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
      soldCount: r.sold?.count ?? 0,
      catalog: j.catalogMatch
        ? `${j.catalogMatch.manufacturer} ${j.catalogMatch.model} (${j.catalogMatch.conditionParam})`
        : null,
      score: j.catalogMatch?.score ?? 0,
    };
    evalCache.set(gun.key, out);
    return out;
  } catch {
    const out = { p25: null, soldCount: 0, catalog: null, score: 0 };
    evalCache.set(gun.key, out);
    return out;
  }
}

function colLetter(n) {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function cell(r, c) {
  return `${colLetter(c)}${r}`;
}

function gbNetFormula(r) {
  const g = cell(r, COL.estResale);
  const o = cell(r, COL.outbound);
  const fvf = `0.06*MIN(${g},400)+0.04*MAX(0,MIN(${g},15000)-400)`;
  return `IF(${g}="","",ROUND(${g}-(${fvf})-5-${o}-0.03*(${g}+${o})-Settings!$B$4,2))`;
}

function styleHeader(cell, bg = "FF1F2937") {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { vertical: "middle", wrapText: true };
}

function styleGroupHeader(cell, bg) {
  cell.font = { bold: true, color: { argb: "FF111827" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { horizontal: "center" };
}

console.error("Fetching live bids...");
const lotMap = await fetchLots();

const ordered = [...MY_BIDS, ...NEW_BIDS.filter((n) => !MY_BIDS.includes(n))];
const rowData = [];

for (const lotNum of ordered) {
  const lot = lotMap.get(String(lotNum));
  if (!lot) {
    console.error(`Missing lot ${lotNum}`);
    continue;
  }
  const gun = parseGun(lot.title);
  if (!gun) continue;

  const ev = await deskEval(gun);
  const outbound = outboundFor(gun.category);
  const p25 = ev.p25;
  const compOk = ev.soldCount >= MIN_SOLD && ev.score >= MIN_SCORE && p25 > 0;

  rowData.push({
    lot: lotNum,
    section: MY_BIDS.includes(lotNum) ? "CART" : "WATCH",
    title: lot.title,
    live: lot.bid,
    myMax: SITE_MAX[lotNum] ?? lot.bid,
    p25: compOk ? p25 : null,
    outbound,
    status: SITE_STATUS[lotNum] ?? "—",
    catalog: ev.catalog,
    soldCount: ev.soldCount,
    compOk,
  });
}

const wb = new ExcelJS.Workbook();

const settings = wb.addWorksheet("Settings");
settings.getCell("A1").value = "Buyer Premium %";
settings.getCell("B1").value = PREMIUM;
settings.getCell("A2").value = "Target Net Profit $";
settings.getCell("B2").value = TARGET;
settings.getCell("A3").value = "Outbound Handgun $ (reference)";
settings.getCell("B3").value = 45;
settings.getCell("A4").value = "Listing Upgrades $";
settings.getCell("B4").value = LISTING;
settings.getCell("A6").value = "How to use";
settings.getCell("B6").value =
  "Yellow cells = you edit (Live Bid, My Max Bid, Est Resale). Everything else recalculates.";
settings.getCell("B7").value = "My Max Bid = what you set on Pearce. Rec Max = walk-away for $50 net.";
settings.getCell("B8").value = "Profit @ My Max = worst-case flip if auction runs to your site max.";
settings.getCell("B9").value = "Lower Est Resale manually for wear/rust (conservative dealer pricing).";
settings.getCell("B10").value = "Re-run export-pearce-bid-sheet.mjs to refresh live bids + comps.";

const ws = wb.addWorksheet("Flip Analysis");

ws.mergeCells("A1:N1");
ws.getCell("A1").value = "Pearce 46969 — FFL Quick-Flip Analysis (GunBroker @ P25, $50 min net)";
ws.getCell("A1").font = { bold: true, size: 14 };

ws.getCell("A2").value = "Total OTD @ My Max:";
ws.getCell("B2").value = { formula: `SUM(${cell(DATA_START, COL.otdMyMax)}:${cell(DATA_START + rowData.length - 1, COL.otdMyMax)})` };
ws.getCell("D2").value = "Lots over Rec Max:";
ws.getCell("E2").value = {
  formula: `COUNTIF(${cell(DATA_START, COL.gap)}:${cell(DATA_START + rowData.length - 1, COL.gap)},"<0")`,
};
ws.getCell("G2").value = "Cart GO @ My Max:";
ws.getCell("H2").value = {
  formula: `COUNTIFS(${cell(DATA_START, COL.section)}:${cell(DATA_START + rowData.length - 1, COL.section)},"CART",${cell(DATA_START, COL.flip)}:${cell(DATA_START + rowData.length - 1, COL.flip)},"GO")`,
};
ws.getCell("B2").numFmt = '"$"#,##0.00';
ws.getCell("E2").numFmt = "0";
ws.getCell("H2").numFmt = "0";

const groupRow = 3;
const groups = [
  { label: "LOT", from: COL.lot, to: COL.gun, color: "FFE5E7EB" },
  { label: "YOUR BIDS  (edit yellow)", from: COL.liveBid, to: COL.gap, color: "FFFEF3C7" },
  { label: "ACQUISITION (OTD)", from: COL.otdLive, to: COL.otdMyMax, color: "FFFEE2E2" },
  { label: "EXIT @ GB P25", from: COL.estResale, to: COL.gbNet, color: "FFDBEAFE" },
  { label: "NET PROFIT", from: COL.profitLive, to: COL.profitMyMax, color: "FFD1FAE5" },
  { label: "CALL", from: COL.flip, to: COL.status, color: "FFE5E7EB" },
];
for (const g of groups) {
  ws.mergeCells(groupRow, g.from, groupRow, g.to);
  const c = ws.getCell(groupRow, g.from);
  c.value = g.label;
  styleGroupHeader(c, g.color);
}

const hdr = 4;
const headers = [
  [COL.lot, "Lot"],
  [COL.gun, "Gun"],
  [COL.section, "Section"],
  [COL.liveBid, "Live Bid\n(auction now)"],
  [COL.myMax, "My Max Bid\n(on Pearce site)"],
  [COL.recMax, "Rec Max Bid\n($50 net floor)"],
  [COL.gap, "Gap\n(Rec − My)"],
  [COL.otdLive, "OTD @ Live"],
  [COL.otdMyMax, "OTD @ My Max"],
  [COL.estResale, "Est Resale $\n(GB P25 — edit)"],
  [COL.gbNet, "GB Net\n(after fees)"],
  [COL.profitLive, "Profit @ Live"],
  [COL.profitMyMax, "Profit @ My Max"],
  [COL.flip, "Flip?"],
  [COL.status, "Status"],
];
for (const [col, label] of headers) {
  const c = ws.getCell(hdr, col);
  c.value = label;
  styleHeader(c);
}

rowData.forEach((r, idx) => {
  const rn = DATA_START + idx;
  const row = ws.getRow(rn);

  row.getCell(COL.lot).value = r.lot;
  row.getCell(COL.gun).value = r.title;
  row.getCell(COL.section).value = r.section;
  row.getCell(COL.liveBid).value = r.live;
  row.getCell(COL.myMax).value = r.myMax;
  row.getCell(COL.recMax).value = {
    formula: `IF(${cell(rn, COL.gbNet)}="","",ROUNDDOWN(MAX(0,(${cell(rn, COL.gbNet)}-Settings!$B$2)/(1+Settings!$B$1/100)),0))`,
  };
  row.getCell(COL.gap).value = {
    formula: `IF(OR(${cell(rn, COL.recMax)}="",${cell(rn, COL.myMax)}=""),"",${cell(rn, COL.recMax)}-${cell(rn, COL.myMax)})`,
  };
  row.getCell(COL.otdLive).value = {
    formula: `IF(${cell(rn, COL.liveBid)}="","",ROUND(${cell(rn, COL.liveBid)}*(1+Settings!$B$1/100),2))`,
  };
  row.getCell(COL.otdMyMax).value = {
    formula: `IF(${cell(rn, COL.myMax)}="","",ROUND(${cell(rn, COL.myMax)}*(1+Settings!$B$1/100),2))`,
  };
  row.getCell(COL.estResale).value = r.p25;
  row.getCell(COL.gbNet).value = { formula: gbNetFormula(rn) };
  row.getCell(COL.profitLive).value = {
    formula: `IF(OR(${cell(rn, COL.gbNet)}="",${cell(rn, COL.otdLive)}=""),"",ROUND(${cell(rn, COL.gbNet)}-${cell(rn, COL.otdLive)},2))`,
  };
  row.getCell(COL.profitMyMax).value = {
    formula: `IF(OR(${cell(rn, COL.gbNet)}="",${cell(rn, COL.otdMyMax)}=""),"",ROUND(${cell(rn, COL.gbNet)}-${cell(rn, COL.otdMyMax)},2))`,
  };
  row.getCell(COL.flip).value = {
    formula: `IF(${cell(rn, COL.profitMyMax)}="","",IF(${cell(rn, COL.profitMyMax)}>=Settings!$B$2,"GO","NO-GO"))`,
  };
  row.getCell(COL.status).value = r.status;
  row.getCell(COL.outbound).value = r.outbound;
  row.getCell(COL.catalog).value = r.catalog;
  row.getCell(COL.sold).value = r.soldCount;

  const moneyCols = [
    COL.liveBid,
    COL.myMax,
    COL.recMax,
    COL.gap,
    COL.otdLive,
    COL.otdMyMax,
    COL.estResale,
    COL.gbNet,
    COL.profitLive,
    COL.profitMyMax,
  ];
  for (const col of moneyCols) {
    row.getCell(col).numFmt = '"$"#,##0.00';
  }
  row.getCell(COL.recMax).numFmt = '"$"#,##0';
  row.getCell(COL.gap).numFmt = "0";

  // Editable inputs
  for (const col of [COL.liveBid, COL.myMax, COL.estResale]) {
    row.getCell(col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF9C3" },
    };
  }
  row.getCell(COL.recMax).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };
});

const last = DATA_START + rowData.length - 1;
ws.addConditionalFormatting({
  ref: `A${DATA_START}:O${last}`,
  rules: [
    {
      type: "expression",
      priority: 1,
      formulae: [`=$${colLetter(COL.myMax)}${DATA_START}>$${colLetter(COL.recMax)}${DATA_START}`],
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFECACA" } },
      },
    },
    {
      type: "expression",
      priority: 2,
      formulae: [`=$${colLetter(COL.flip)}${DATA_START}="GO"`],
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } },
      },
    },
    {
      type: "expression",
      priority: 3,
      formulae: [`=$${colLetter(COL.status)}${DATA_START}="Outbid"`],
      style: {
        font: { color: { argb: "FFB45309" }, bold: true },
      },
    },
    {
      type: "expression",
      priority: 4,
      formulae: [`=$${colLetter(COL.profitMyMax)}${DATA_START}>=Settings!$B$2`],
      style: {
        font: { color: { argb: "FF166534" } },
      },
    },
  ],
});

ws.views = [{ state: "frozen", ySplit: 4 }];
ws.getRow(4).height = 36;
ws.getColumn(COL.gun).width = 48;
ws.getColumn(COL.section).width = 8;
[COL.liveBid, COL.myMax, COL.recMax, COL.otdLive, COL.otdMyMax, COL.estResale, COL.gbNet, COL.profitLive, COL.profitMyMax].forEach(
  (c) => {
    ws.getColumn(c).width = 13;
  },
);
ws.getColumn(COL.gap).width = 10;
ws.getColumn(COL.flip).width = 8;
ws.getColumn(COL.status).width = 12;
for (const c of [COL.outbound, COL.catalog, COL.sold]) {
  ws.getColumn(c).hidden = true;
}

try {
  await wb.xlsx.writeFile(OUT);
  console.log(`Wrote ${OUT} (${rowData.length} lots)`);
} catch {
  const alt = OUT.replace(".xlsx", "-copy.xlsx");
  await wb.xlsx.writeFile(alt);
  console.log(`Wrote ${alt} — close Excel and rerun`);
}

for (const r of rowData) {
  const net = r.p25 ? gbNet(r.p25, r.outbound) : null;
  const rec = net ? Math.floor(walkAwayHammer(net)) : "—";
  console.log(
    `${r.lot} | live $${r.live} | myMax $${r.myMax} | rec $${rec} | profit@myMax $${net ? round2(net - allIn(r.myMax)) : "—"}`,
  );
}
