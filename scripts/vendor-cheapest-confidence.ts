/**
 * Vendor cheapest-wins + UPC match confidence diagnostics.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const VENDORS = ["lipseys", "zanders", "davidsons", "chattanooga"] as const;
type Vendor = (typeof VENDORS)[number];

function cleanUpc(u: unknown): string | null {
  const s = String(u ?? "").replace(/\D/g, "");
  if (s.length < 11 || s.length > 14) return null; // prefer GTIN-12/13/14
  return s;
}

function norm(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Row = {
  vendor: Vendor;
  manufacturer: string;
  model: string;
  description: string;
  upc: string;
  price: number;
};

async function main() {
  const c = createClient({ url: "file:./data/desk.db" });
  const r = await c.execute(`
    SELECT vendor_name, manufacturer, model, description, upc, dealer_price
    FROM catalog_items
    WHERE dealer_price IS NOT NULL AND dealer_price > 0
      AND upc IS NOT NULL AND trim(upc) != ''
  `);

  const byUpc = new Map<string, Partial<Record<Vendor, Row>>>();
  for (const row of r.rows) {
    const vendor = String(row.vendor_name) as Vendor;
    if (!VENDORS.includes(vendor)) continue;
    const upc = cleanUpc(row.upc);
    if (!upc) continue;
    const rec: Row = {
      vendor,
      manufacturer: String(row.manufacturer ?? ""),
      model: String(row.model ?? ""),
      description: String(row.description ?? ""),
      upc,
      price: Number(row.dealer_price),
    };
    const cur = byUpc.get(upc) ?? {};
    const prev = cur[vendor];
    if (!prev || rec.price < prev.price) cur[vendor] = rec;
    byUpc.set(upc, cur);
  }

  type Shared = {
    upc: string;
    vendors: Vendor[];
    prices: Record<string, number>;
    titles: Record<string, string>;
    cheapest: Vendor;
    spread: number;
    spreadPct: number;
    titleAgree: "strong" | "partial" | "weak";
    confidence: number;
  };

  const shared4: Shared[] = [];
  const sharedAny2plus: Shared[] = [];

  for (const [upc, hits] of byUpc) {
    const present = VENDORS.filter((v) => hits[v]);
    if (present.length < 2) continue;

    const prices: Record<string, number> = {};
    const titles: Record<string, string> = {};
    for (const v of present) {
      prices[v] = hits[v]!.price;
      titles[v] = `${hits[v]!.manufacturer} ${hits[v]!.model || hits[v]!.description}`.trim();
    }
    const vals = present.map((v) => prices[v]!);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const cheapest = present.find((v) => prices[v] === min)!;

    // Title agreement: tokenize and compare pairwise Jaccard of significant tokens
    const tokenSets = present.map((v) => {
      const t = norm(titles[v]);
      return new Set(
        t
          .split(" ")
          .filter((w) => w.length >= 2)
          .filter((w) => !/^(THE|AND|FOR|WITH|BLK|BLACK|SS|OD|FDE)$/.test(w)),
      );
    });
    let pairSims: number[] = [];
    for (let i = 0; i < tokenSets.length; i++) {
      for (let j = i + 1; j < tokenSets.length; j++) {
        const a = tokenSets[i]!;
        const b = tokenSets[j]!;
        let inter = 0;
        for (const x of a) if (b.has(x)) inter += 1;
        const union = a.size + b.size - inter || 1;
        pairSims.push(inter / union);
      }
    }
    const avgSim = pairSims.reduce((s, x) => s + x, 0) / (pairSims.length || 1);
    const titleAgree: Shared["titleAgree"] =
      avgSim >= 0.45 ? "strong" : avgSim >= 0.2 ? "partial" : "weak";

    // Confidence score 0-100
    // Base: valid UPC length
    let conf = upc.length === 12 || upc.length === 13 ? 85 : 70;
    // Title agreement bump/penalty
    if (titleAgree === "strong") conf += 10;
    else if (titleAgree === "partial") conf += 0;
    else conf -= 25;
    // Extreme price spread vs median can be real (MAP/special) or data error — soft penalty
    const med = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)]!;
    const spreadPct = med > 0 ? ((max - min) / med) * 100 : 0;
    if (spreadPct > 80) conf -= 15;
    else if (spreadPct > 40) conf -= 5;
    conf = Math.max(5, Math.min(99, conf));

    const row: Shared = {
      upc,
      vendors: present,
      prices,
      titles,
      cheapest,
      spread: max - min,
      spreadPct,
      titleAgree,
      confidence: conf,
    };
    sharedAny2plus.push(row);
    if (present.length === 4) shared4.push(row);
  }

  const wins4: Record<Vendor, number> = {
    lipseys: 0,
    zanders: 0,
    davidsons: 0,
    chattanooga: 0,
  };
  const wins2: Record<Vendor, number> = {
    lipseys: 0,
    zanders: 0,
    davidsons: 0,
    chattanooga: 0,
  };
  let dollarsSavedVsMax4 = {
    lipseys: 0,
    zanders: 0,
    davidsons: 0,
    chattanooga: 0,
  };

  for (const s of shared4) {
    wins4[s.cheapest] += 1;
    const max = Math.max(...Object.values(s.prices));
    dollarsSavedVsMax4[s.cheapest] += max - s.prices[s.cheapest]!;
  }
  for (const s of sharedAny2plus) wins2[s.cheapest] += 1;

  const confBuckets4 = { high: 0, med: 0, low: 0 };
  for (const s of shared4) {
    if (s.confidence >= 85) confBuckets4.high += 1;
    else if (s.confidence >= 60) confBuckets4.med += 1;
    else confBuckets4.low += 1;
  }

  const titleBuckets4 = { strong: 0, partial: 0, weak: 0 };
  for (const s of shared4) titleBuckets4[s.titleAgree] += 1;

  const avgConf4 =
    shared4.reduce((s, x) => s + x.confidence, 0) / (shared4.length || 1);

  // Suspicious: all4 with weak titles or huge spreads
  const suspicious = shared4
    .filter((s) => s.titleAgree === "weak" || s.spreadPct > 60)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 25)
    .map((s) => ({
      upc: s.upc,
      confidence: s.confidence,
      titleAgree: s.titleAgree,
      spreadPct: Math.round(s.spreadPct),
      cheapest: s.cheapest,
      titles: s.titles,
      prices: s.prices,
    }));

  const highConfCheapest = { lipseys: 0, zanders: 0, davidsons: 0, chattanooga: 0 };
  for (const s of shared4.filter((x) => x.confidence >= 85)) {
    highConfCheapest[s.cheapest] += 1;
  }

  const out = {
    method:
      "Same item = identical numeric UPC present at multiple vendors. Confidence blends UPC validity, title token overlap, and extreme price-spread penalty.",
    shared4Count: shared4.length,
    shared2plusCount: sharedAny2plus.length,
    winsAll4: wins4,
    winsAnyOverlap: wins2,
    highConfWinsAll4: highConfCheapest,
    avgConfidenceAll4: Math.round(avgConf4 * 10) / 10,
    confidenceBucketsAll4: confBuckets4,
    titleAgreementAll4: titleBuckets4,
    dollarsSavedVsMaxWhenCheapest: Object.fromEntries(
      Object.entries(dollarsSavedVsMax4).map(([k, v]) => [k, Math.round(v)]),
    ),
    overallCheapestVerdict: Object.entries(wins4).sort((a, b) => b[1] - a[1])[0],
    overallCheapestHighConf: Object.entries(highConfCheapest).sort((a, b) => b[1] - a[1])[0],
    suspiciousSample: suspicious,
  };

  writeFileSync("data/vendor-cheapest-confidence.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
