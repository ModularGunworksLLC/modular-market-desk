/**
 * Add live-calc formulas + NO-GO row highlighting to auction_inventory..xlsx
 */
import ExcelJS from "exceljs";

const PATH = "C:/Users/micha/OneDrive/Desktop/auction_inventory..xlsx";
const DATA_START = 2;

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

// Col letters: B=category, E=current, G=max, H=p25, J=allin, K=profit, L=headroom, M=verdict
function outboundShipExpr(r) {
  const cat = `B${r}`;
  return `IF(OR(ISNUMBER(SEARCH("Rifle",${cat})),ISNUMBER(SEARCH("Shotgun",${cat}))),Settings!$B$3,Settings!$B$2)`;
}

function profitFormula(r) {
  const g = `H${r}`;
  const hammer = `E${r}`;
  const out = outboundShipExpr(r);
  const list = `Settings!$B$4`;
  const prem = `Settings!$B$1`;
  const fvf = `0.06*MIN(${g},400)+0.04*MAX(0,MIN(${g},15000)-400)`;
  const netA = `${g}-(${fvf})-5-${out}-0.03*(${g}+${out})-${list}`;
  const netB = `${g}/1.09`;
  const best = `MAX(${netA},${netB})`;
  const allIn = `${hammer}*(1+${prem}/100)`;
  return `IF(OR(${hammer}="",${g}=""),"",ROUND(${best}-${allIn},2))`;
}

function allInFormula(r) {
  return `IF(E${r}="","",ROUND(E${r}*(1+Settings!$B$1/100),2))`;
}

function headroomFormula(r) {
  return `IF(OR(E${r}="",G${r}=""),"",ROUND(G${r}-E${r},2))`;
}

function verdictFormula(r) {
  return `IF(E${r}="","",IF(H${r}="","N/A",IF(K${r}>=Settings!$B$5,"GO","NO-GO")))`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PATH);

  let ws = wb.getWorksheet("auction_inventory") ?? wb.worksheets[0];
  if (!ws) throw new Error("No worksheet found");

  // Settings sheet (desk defaults)
  let settings = wb.getWorksheet("Settings");
  if (!settings) settings = wb.addWorksheet("Settings");
  settings.getCell("A1").value = "Buyer Premium %";
  settings.getCell("B1").value = 18.5;
  settings.getCell("A2").value = "Outbound Ship — Handgun/Pistol $";
  settings.getCell("B2").value = 45;
  settings.getCell("A3").value = "Outbound Ship — Rifle/Shotgun $";
  settings.getCell("B3").value = 60;
  settings.getCell("A4").value = "Listing Upgrades $";
  settings.getCell("B4").value = 3;
  settings.getCell("A5").value = "Target Profit $";
  settings.getCell("B5").value = 50;
  settings.getCell("A7").value =
    "Change Current Bid (col E) to recalc. Ship auto by Category: handgun/pistol $45, rifle/shotgun $60.";

  // Map existing data by header name from row 1
  const oldHeaderRow = ws.getRow(1);
  const colMap = {};
  oldHeaderRow.eachCell((cell, col) => {
    const key = String(cell.value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    colMap[key] = col;
  });

  const getCol = (...names) => {
    for (const n of names) {
      const k = n.toLowerCase().replace(/\s+/g, " ");
      if (colMap[k] != null) return colMap[k];
    }
    return null;
  };

  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = (names) => {
      const c = getCol(...names);
      return c ? row.getCell(c).value : "";
    };
    rows.push({
      lot: v("lot"),
      category: v("category"),
      desc: v("item description"),
      serial: v("serial number"),
      current: v("current bid"),
      my: v("my current bid"),
      max: v("max hammer bid"),
      gbMin: v("gunbroker est value min"),
      gbMax: v("gunbroker est value max"),
      notes: v("margin notes"),
    });
  });

  // Rewrite sheet with clean layout
  ws.spliceRows(1, ws.rowCount);
  const headerRow = ws.getRow(1);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  rows.forEach((r, idx) => {
    const rowNum = DATA_START + idx;
    const row = ws.getRow(rowNum);
    row.getCell(1).value = r.lot;
    row.getCell(2).value = r.category;
    row.getCell(3).value = r.desc;
    row.getCell(4).value = r.serial;
    row.getCell(5).value = r.current === "" ? null : Number(r.current) || r.current;
    row.getCell(6).value = r.my === "" ? null : Number(r.my) || r.my;
    row.getCell(7).value = r.max === "" ? null : Number(r.max) || r.max;
    row.getCell(8).value = r.gbMin === "" ? null : Number(r.gbMin) || r.gbMin;
    row.getCell(9).value = r.gbMax === "" ? null : Number(r.gbMax) || r.gbMax;
    row.getCell(10).value = { formula: allInFormula(rowNum) };
    row.getCell(11).value = { formula: profitFormula(rowNum) };
    row.getCell(12).value = { formula: headroomFormula(rowNum) };
    row.getCell(13).value = { formula: verdictFormula(rowNum) };
    row.getCell(14).value = r.notes;

    [5, 6, 7, 8, 9, 10, 11, 12].forEach((c) => {
      row.getCell(c).numFmt = '"$"#,##0.00';
    });
  });

  const lastRow = DATA_START + rows.length - 1;
  const ref = `A${DATA_START}:N${lastRow}`;

  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: [`=$M${DATA_START}="NO-GO"`],
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            bgColor: { argb: "FFFECACA" },
          },
          font: { color: { argb: "FF991B1B" } },
        },
      },
      {
        type: "expression",
        priority: 2,
        formulae: [`=$M${DATA_START}="GO"`],
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            bgColor: { argb: "FFD1FAE5" },
          },
          font: { color: { argb: "FF065F46" } },
        },
      },
    ],
  });

  // Column widths
  ws.getColumn(3).width = 42;
  ws.getColumn(14).width = 48;
  ws.getColumn(5).width = 12;
  ws.getColumn(10).width = 14;
  ws.getColumn(11).width = 16;
  ws.getColumn(13).width = 10;

  // Freeze header + highlight editable Current Bid column
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  for (let r = DATA_START; r <= lastRow; r++) {
    ws.getCell(`E${r}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF9C3" },
    };
  }

  try {
    await wb.xlsx.writeFile(PATH);
    console.log(`Updated ${PATH} — ${rows.length} rows, formulas in J–M, NO-GO rows highlighted.`);
  } catch (e) {
    const fallback = PATH.replace(".xlsx", "_formulas.xlsx");
    await wb.xlsx.writeFile(fallback);
    console.error(`Original locked. Wrote ${fallback}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
