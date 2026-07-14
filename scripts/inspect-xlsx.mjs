import XLSX from "xlsx";
const wb = XLSX.readFile("C:/Users/micha/OneDrive/Desktop/auction_inventory..xlsx");
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
console.log("count", rows.length);
rows.slice(0, 25).forEach((r) =>
  console.log(r.Lot, r["Item Description"]?.slice(0, 50), r[" Current Bid "]),
);
