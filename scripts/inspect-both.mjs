import XLSX from "xlsx";
import ExcelJS from "exceljs";

for (const path of [
  "C:/Users/micha/OneDrive/Desktop/auction_inventory..xlsx",
  "C:/Users/micha/OneDrive/Desktop/auction_inventory_updated.xlsx",
  "C:/Users/micha/OneDrive/Desktop/auction_inventory.csv",
]) {
  console.log("\n===", path);
  if (path.endsWith(".csv")) {
    const wb = XLSX.readFile(path);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    console.log("rows", rows.length, "sample", rows[0]);
    continue;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  console.log("name", ws.name, "rowCount", ws.rowCount);
  const r2 = ws.getRow(2).values;
  const r1 = ws.getRow(1).values;
  console.log("header", r1?.slice?.(1, 8));
  console.log("row2", r2?.slice?.(1, 8));
}
