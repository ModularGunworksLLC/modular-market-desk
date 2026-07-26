/**
 * Vendor catalog overlap — UPC-first, then soft make+model.
 * Writes data/vendor-overlap-report.json for the canvas.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const VENDORS = ["lipseys", "zanders", "davidsons", "chattanooga"] as const;
type Vendor = (typeof VENDORS)[number];

const LABELS: Record<Vendor, string> = {
  lipseys: "Lipsey's",
  zanders: "Zanders",
  davidsons: "Davidson's",
  chattanooga: "Chattanooga",
};

function normText(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(
      /\b(INC|LLC|LTD|CO|COMPANY|CORP|CORPORATION|MFG|MANUFACTURING|ARMS|FIREARMS|USA|THE)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUpc(u: unknown): string | null {
  const s = String(u ?? "").replace(/\D/g, "");
  if (s.length < 8 || s.length > 14) return null;
  return s;
}

type Row = {
  vendor: Vendor;
  manufacturer: string;
  model: string;
  description: string;
  upc: string | null;
  price: number;
};

async function main() {
  const c = createClient({ url: "file:./data/desk.db" });
  const r = await c.execute(`
    SELECT vendor_name, manufacturer, model, description, upc, dealer_price
    FROM catalog_items
    WHERE dealer_price IS NOT NULL AND dealer_price > 0
  `);

  const rows: Row[] = [];
  for (const row of r.rows) {
    const vendor = String(row.vendor_name) as Vendor;
    if (!VENDORS.includes(vendor)) continue;
    rows.push({
      vendor,
      manufacturer: String(row.manufacturer ?? ""),
      model: String(row.model ?? ""),
      description: String(row.description ?? ""),
      upc: cleanUpc(row.upc),
      price: Number(row.dealer_price),
    });
  }

  // --- UPC overlap ---
  const byUpc = new Map<string, Partial<Record<Vendor, Row>>>();
  for (const row of rows) {
    if (!row.upc) continue;
    const cur = byUpc.get(row.upc) ?? {};
    // keep cheapest per vendor for that UPC
    const prev = cur[row.vendor];
    if (!prev || row.price < prev.price) cur[row.vendor] = row;
    byUpc.set(row.upc, cur);
  }

  let upc1 = 0;
  let upc2 = 0;
  let upc3 = 0;
  let upc4 = 0;
  const upcAll4: Array<{
    upc: string;
    manufacturer: string;
    model: string;
    prices: Record<string, number>;
    spread: number;
    cheapest: string;
  }> = [];
  const upcBrandCounts: Record<string, number> = {};

  for (const [upc, hits] of byUpc) {
    const present = VENDORS.filter((v) => hits[v]);
    const n = present.length;
    if (n === 1) upc1 += 1;
    else if (n === 2) upc2 += 1;
    else if (n === 3) upc3 += 1;
    else if (n === 4) {
      upc4 += 1;
      const any = hits.lipseys ?? hits.davidsons ?? hits.chattanooga ?? hits.zanders!;
      const brand = normText(any.manufacturer) || "UNKNOWN";
      upcBrandCounts[brand] = (upcBrandCounts[brand] ?? 0) + 1;
      const prices: Record<string, number> = {};
      for (const v of VENDORS) prices[v] = hits[v]!.price;
      const vals = Object.values(prices);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      upcAll4.push({
        upc,
        manufacturer: any.manufacturer,
        model: any.model || any.description,
        prices,
        spread: max - min,
        cheapest: VENDORS.find((v) => prices[v] === min) ?? "",
      });
    }
  }

  upcAll4.sort(
    (a, b) =>
      a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model),
  );

  // --- Soft make+model (skip Unknown / empty / description-length models for zanders noise) ---
  const byMm = new Map<string, Partial<Record<Vendor, Row>>>();
  for (const row of rows) {
    const mfr = normText(row.manufacturer);
    let model = normText(row.model);
    if (!mfr || mfr === "UNKNOWN" || !model) continue;
    // Cap model key length so Zanders full-title models can still soft-match shorter OEM models
    // Use first 6 meaningful tokens of model for soft key
    const modelToks = model.split(" ").filter(Boolean).slice(0, 6).join(" ");
    if (modelToks.length < 2) continue;
    const key = `${mfr}||${modelToks}`;
    const cur = byMm.get(key) ?? {};
    const prev = cur[row.vendor];
    if (!prev || row.price < prev.price) cur[row.vendor] = row;
    byMm.set(key, cur);
  }

  let mm1 = 0;
  let mm2 = 0;
  let mm3 = 0;
  let mm4 = 0;
  const mmAll4: Array<{
    key: string;
    manufacturer: string;
    model: string;
    prices: Record<string, number>;
    spread: number;
    cheapest: string;
  }> = [];
  const mmBrandCounts: Record<string, number> = {};

  for (const [key, hits] of byMm) {
    const present = VENDORS.filter((v) => hits[v]);
    const n = present.length;
    if (n === 1) mm1 += 1;
    else if (n === 2) mm2 += 1;
    else if (n === 3) mm3 += 1;
    else if (n === 4) {
      mm4 += 1;
      const any = hits.lipseys ?? hits.davidsons ?? hits.chattanooga ?? hits.zanders!;
      const brand = normText(any.manufacturer) || "UNKNOWN";
      mmBrandCounts[brand] = (mmBrandCounts[brand] ?? 0) + 1;
      const prices: Record<string, number> = {};
      for (const v of VENDORS) prices[v] = hits[v]!.price;
      const vals = Object.values(prices);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      mmAll4.push({
        key,
        manufacturer: any.manufacturer,
        model: any.model,
        prices,
        spread: max - min,
        cheapest: VENDORS.find((v) => prices[v] === min) ?? "",
      });
    }
  }

  mmAll4.sort(
    (a, b) =>
      a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model),
  );

  // Pairwise UPC
  const pairwiseUpc: Array<{
    a: string;
    b: string;
    shared: number;
    onlyA: number;
    onlyB: number;
    pctOfA: number;
    pctOfB: number;
  }> = [];
  const upcSets: Record<Vendor, Set<string>> = {
    lipseys: new Set(),
    zanders: new Set(),
    davidsons: new Set(),
    chattanooga: new Set(),
  };
  for (const [upc, hits] of byUpc) {
    for (const v of VENDORS) if (hits[v]) upcSets[v].add(upc);
  }
  for (let i = 0; i < VENDORS.length; i++) {
    for (let j = i + 1; j < VENDORS.length; j++) {
      const a = VENDORS[i]!;
      const b = VENDORS[j]!;
      let shared = 0;
      for (const u of upcSets[a]) if (upcSets[b].has(u)) shared += 1;
      pairwiseUpc.push({
        a,
        b,
        shared,
        onlyA: upcSets[a].size - shared,
        onlyB: upcSets[b].size - shared,
        pctOfA: upcSets[a].size ? (shared / upcSets[a].size) * 100 : 0,
        pctOfB: upcSets[b].size ? (shared / upcSets[b].size) * 100 : 0,
      });
    }
  }

  const vendorUpcCounts = Object.fromEntries(
    VENDORS.map((v) => [v, upcSets[v].size]),
  );
  const vendorRowCounts: Record<string, number> = {};
  for (const v of VENDORS) vendorRowCounts[v] = rows.filter((x) => x.vendor === v).length;

  const topUpcBrands = Object.entries(upcBrandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([brand, count]) => ({ brand, count }));

  const topMmBrands = Object.entries(mmBrandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([brand, count]) => ({ brand, count }));

  const biggestUpcSpreads = [...upcAll4].sort((a, b) => b.spread - a.spread).slice(0, 30);
  const cheapestWins: Record<string, number> = {
    lipseys: 0,
    zanders: 0,
    davidsons: 0,
    chattanooga: 0,
  };
  for (const row of upcAll4) cheapestWins[row.cheapest] = (cheapestWins[row.cheapest] ?? 0) + 1;

  const out = {
    generatedAt: new Date().toISOString(),
    labels: LABELS,
    vendorRowCounts,
    vendorUpcCounts,
    upcCoverage: { only1: upc1, overlap2: upc2, overlap3: upc3, overlap4: upc4 },
    mmCoverage: { only1: mm1, overlap2: mm2, overlap3: mm3, overlap4: mm4 },
    pairwiseUpc,
    topUpcBrands,
    topMmBrands,
    upcAll4Count: upcAll4.length,
    upcAll4: upcAll4.slice(0, 200), // canvas embed cap
    upcAll4FullCount: upcAll4.length,
    mmAll4Count: mmAll4.length,
    mmAll4: mmAll4.slice(0, 200),
    biggestUpcSpreads,
    cheapestWins,
  };

  writeFileSync("data/vendor-overlap-report.json", JSON.stringify(out));
  console.log(
    JSON.stringify(
      {
        vendorRowCounts,
        vendorUpcCounts,
        upcCoverage: out.upcCoverage,
        mmCoverage: out.mmCoverage,
        pairwiseUpc,
        topUpcBrands: topUpcBrands.slice(0, 15),
        topMmBrands: topMmBrands.slice(0, 15),
        upcAll4Count: upcAll4.length,
        mmAll4Count: mmAll4.length,
        sampleUpcAll4: upcAll4.slice(0, 20),
        sampleMmAll4: mmAll4.slice(0, 15),
        biggestUpcSpreads: biggestUpcSpreads.slice(0, 10),
        cheapestWins,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
