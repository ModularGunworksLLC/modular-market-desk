/**
 * RSR Group inventory file (rsrinventory-new.txt) — semicolon-delimited, no header row.
 * Layout: https://www.rsrgroup.com/dealers-toolbox/inventory-file-layout
 * Field indices are 0-based.
 */

export const RSR_DEPT_LABELS: Record<number, string> = {
  1: "Handguns",
  2: "Used Handguns",
  3: "Used Long Guns",
  4: "Tasers",
  5: "Long Guns",
  6: "NFA Products",
  7: "Black Powder",
  8: "Optics",
  9: "Optical Accessories",
  10: "Magazines",
  11: "Grips, Pads, Stocks, Bipods",
  12: "Soft Gun Cases, Packs, Bags",
  13: "Misc. Accessories",
  14: "Holsters & Pouches",
  15: "Reloading Equipment",
  16: "Black Powder Accessories",
  17: "Closeout Accessories",
  18: "Ammunition",
  19: "Survival & Camping Supplies",
  20: "Lights, Lasers & Batteries",
  21: "Cleaning Equipment",
  22: "Airguns",
  23: "Knives & Tools",
  24: "High Capacity Magazines",
  25: "Safes & Security",
  26: "Safety & Protection",
  27: "Non-Lethal Defense",
  28: "Binoculars",
  29: "Spotting Scopes",
  30: "Sights",
  31: "Optical Accessories",
  32: "Barrels, Choke Tubes & Muzzle Devices",
  33: "Clothing",
  34: "Parts",
  35: "Slings & Swivels",
  36: "Electronics",
  38: "Books, Software & DVDs",
  39: "Targets",
  40: "Hard Gun Cases",
  41: "Upper Receivers & Conversion Kits",
  42: "SBR Barrels & Upper Receivers",
  43: "Upper Receivers & Conversion Kits - High Capacity",
};

export type RsrInventoryRow = {
  sku: string;
  upc: string | null;
  description: string;
  department: number | null;
  category: string | null;
  manufacturer: string;
  model: string;
  mpn: string | null;
  dealerPrice: number;
  msrp: number | null;
  qty: number | null;
  status: string | null;
};

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function qty(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Parse one semicolon-delimited inventory line (no header). */
export function parseRsrInventoryLine(line: string): RsrInventoryRow | null {
  const parts = line.split(";");
  if (parts.length < 12) return null;
  const sku = (parts[0] ?? "").trim();
  if (!sku) return null;
  const dealerPrice = money(parts[6]);
  if (dealerPrice == null) return null;
  const dept = Number((parts[3] ?? "").trim());
  const department = Number.isFinite(dept) ? dept : null;
  const upcRaw = (parts[1] ?? "").trim();
  const upc = upcRaw && /\d{8,14}/.test(upcRaw) ? upcRaw.replace(/\D/g, "") : null;
  const manufacturer = (parts[10] ?? "").trim() || "Unknown";
  const model = (parts[9] ?? "").trim() || (parts[2] ?? "").trim() || sku;
  const description = (parts[2] ?? "").trim() || model;
  return {
    sku,
    upc,
    description,
    department,
    category: department != null ? (RSR_DEPT_LABELS[department] ?? `Dept ${department}`) : null,
    manufacturer,
    model,
    mpn: (parts[11] ?? "").trim() || null,
    dealerPrice,
    msrp: money(parts[5]),
    qty: qty(parts[8]),
    status: (parts[12] ?? "").trim() || null,
  };
}

export function parseRsrInventoryText(text: string): RsrInventoryRow[] {
  const out: RsrInventoryRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = parseRsrInventoryLine(trimmed);
    if (row) out.push(row);
  }
  return out;
}
