/**
 * Batch auction-sheet parsing (pure, no I/O).
 *
 * Auction houses export wildly different CSVs, so the desk supports two shapes:
 *   1. A single free-text title/description blob ("Glock 19 Gen5 9mm Luger") that we
 *      decompose into manufacturer / model / caliber heuristically.
 *   2. Discrete Make / Model / Caliber columns.
 *
 * Header matching is alias-driven and case/punctuation-insensitive, mirroring the
 * data-driven approach used by the distributor CSV importer.
 */

export interface BatchRow {
  /** 1-based source row (excludes the header). */
  rowNumber: number;
  lot: string;
  manufacturer: string;
  model: string;
  caliber: string;
  upc: string;
  category: string;
  currentBid: number | null;
  buyerPremiumPct: number | null;
  /** The raw title blob, when present — surfaced for analyst review. */
  rawTitle: string;
  /** True when manufacturer/model could not be resolved (row is skipped). */
  unresolved: boolean;
}

export interface ParseBatchResult {
  rows: BatchRow[];
  /** Header alias → resolved canonical field, for UI transparency. */
  mapping: Record<string, string>;
  warnings: string[];
}

type Field =
  | "lot"
  | "title"
  | "manufacturer"
  | "model"
  | "caliber"
  | "upc"
  | "category"
  | "currentBid"
  | "buyerPremiumPct";

const HEADER_ALIASES: Record<Field, string[]> = {
  lot: ["lot", "lot#", "lotnumber", "lotno", "item#", "itemnumber", "itemno", "no"],
  title: [
    "title",
    "description",
    "desc",
    "name",
    "itemtitle",
    "lottitle",
    "itemdescription",
    "itemdesc",
    "lotdescription",
    "productdescription",
    "itemname",
    "lotname",
    "details",
    "summary",
    "gun",
    "firearm",
  ],
  manufacturer: [
    "make",
    "manufacturer",
    "manufacture",
    "manufactuer",
    "maufacturer",
    "brand",
    "mfr",
    "mfg",
    "maker",
    "gunmake",
    "firearmmake",
  ],
  model: ["model", "modelname", "modelno"],
  caliber: ["caliber", "calibre", "cal", "gauge", "chambering"],
  upc: ["upc", "barcode", "ean", "gtin", "upccode"],
  category: ["category", "type", "class", "producttype"],
  currentBid: [
    "currentbid",
    "bid",
    "currentprice",
    "price",
    "highbid",
    "startingbid",
    "startbid",
    "estimate",
    "estimatelow",
    "hammer",
    "amount",
  ],
  buyerPremiumPct: ["buyerspremium", "buyerpremium", "premium", "bp", "bppct", "premiumpct"],
};

function normHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveHeader(header: string): Field | null {
  const n = normHeader(header);
  if (!n) return null;
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    if (HEADER_ALIASES[field].includes(n)) return field;
  }
  // Contains-based fallback for header variants we didn't enumerate exactly.
  if (n.includes("description") || n.includes("title")) return "title";
  if (n.includes("manufactur") || n === "make" || n === "brand" || n === "manufacture") {
    return "manufacturer";
  }
  if (n.includes("caliber") || n.includes("calibre")) return "caliber";
  if (n === "item") return "title";
  if (n.includes("lot")) return "lot";
  return null;
}

/**
 * Pick the delimiter that yields the most columns on the header line. Auction
 * sheets can be small (3-4 columns), so a raw count beats fixed thresholds.
 */
function pickDelimiter(headerLine: string): string {
  const candidates = ["\t", ",", ";", "|"];
  let best = ",";
  let bestCount = 1;
  for (const d of candidates) {
    const count = splitLine(headerLine, d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Minimal RFC-ish CSV line splitter that respects quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseMoney(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePct(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[%\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

// --- Title-blob decomposition -------------------------------------------------

/** Known firearm brands, longest-first so multi-word names win. */
const BRANDS: string[] = [
  "smith & wesson",
  "smith and wesson",
  "harrington & richardson",
  "harrington and richardson",
  "hopkins & allen",
  "hopkins and allen",
  "connecticut valley arms",
  "palmetto state armory",
  "sears, roebuck, & co",
  "sears roebuck",
  "radical firearms",
  "shadow systems",
  "american tactical",
  "alpha foxtrot",
  "double tap defense",
  "north american arms",
  "rock island armory",
  "rock island",
  "heckler & koch",
  "heckler and koch",
  "springfield armory",
  "daniel defense",
  "wilson combat",
  "thompson center",
  "thompson/center",
  "auto-ordnance",
  "auto ordnance",
  "sharps brothers",
  "sharps bros",
  "spikes tactical",
  "heritage manufacturing",
  "national ordnance",
  "charles daly",
  "jc higgins",
  "just right carbine",
  "bearman industries",
  "rg industries",
  "glenfield firearms",
  "arminius firearms",
  "citadel firearms",
  "fmk firearms",
  "jts firearms",
  "panzer arms",
  "richland arms",
  "raven arms",
  "adler hunting arms",
  "sun city machinery",
  "sig sauer",
  "bond arms",
  "high standard",
  "hi-point",
  "hi point",
  "charter arms",
  "iver johnson",
  "kel-tec",
  "kel tec",
  "magnum research",
  "aero precision",
  "century arms",
  "tisas arms",
  "arthemis silah sanayi",
  "leopar sil san",
  "springfield",
  "weatherby",
  "diamondback",
  "christensen arms",
  "tippmann",
  "heritage",
  "maverick",
  "remington",
  "winchester",
  "mossberg",
  "browning",
  "beretta",
  "benelli",
  "stoeger",
  "bergara",
  "tikka",
  "sako",
  "henry",
  "marlin",
  "ruger",
  "glock",
  "walther",
  "taurus",
  "canik",
  "kimber",
  "colt",
  "savage",
  "stevens",
  "bushmaster",
  "aero",
  "rossi",
  "llama",
  "norinco",
  "zastava",
  "century",
  "palmetto",
  "psa",
  "ria",
  "chiappa",
  "howa",
  "ithaca",
  "tokarev",
  "archangel",
  "tisas",
  "sears",
  "h&r",
  "cva",
  "eaa",
  "cai",
  "fmk",
  "rohm",
  "grendel",
  "sarsilmaz",
  "pardus",
  "churchill",
  "akkar",
  "llama",
  "linberta",
  "revelation",
  "ina",
  "gsg",
  "fnh",
  "fn",
  "hk",
  "cz",
  "sccy",
  "kahr",
  "dpms",
  "armscor",
  "staccato",
  "iwi",
  "steyr",
  "anderson",
  "ar-15",
];

const BRAND_ALIASES: Record<string, string> = {
  "smith": "Smith & Wesson",
  "s&w": "Smith & Wesson",
  "smith and wesson": "Smith & Wesson",
  "smith & wesson": "Smith & Wesson",
  "sig": "Sig Sauer",
  "sig sauer": "Sig Sauer",
  "hk": "Heckler & Koch",
  "heckler and koch": "Heckler & Koch",
  "heckler & koch": "Heckler & Koch",
  "kel tec": "Kel-Tec",
  "kel-tec": "Kel-Tec",
  "psa": "Palmetto State Armory",
  "palmetto": "Palmetto State Armory",
  "palmetto state armory": "Palmetto State Armory",
  "springfield armory": "Springfield",
  "rock island": "Rock Island Armory",
  "rock island armory": "Rock Island Armory",
  "aero": "Aero Precision",
  "aero precision": "Aero Precision",
  "thompson center": "Thompson/Center",
  "thompson/center": "Thompson/Center",
  "auto ordnance": "Auto-Ordnance",
  "auto-ordnance": "Auto-Ordnance",
  "sharps brothers": "Sharps Bros",
  "sharps bros": "Sharps Bros",
  "hi point": "Hi-Point",
  "hi-point": "Hi-Point",
  "heritage manufacturing": "Heritage",
  "north american arms": "North American Arms",
  "iver johnson": "Iver Johnson",
  "fnh": "FN",
  "century": "Century Arms",
  "magnum research": "Magnum Research",
  ria: "Rock Island Armory",
  "h&r": "Harrington & Richardson",
  "harrington & richardson": "Harrington & Richardson",
  "harrington and richardson": "Harrington & Richardson",
  cva: "Connecticut Valley Arms",
  "connecticut valley arms": "Connecticut Valley Arms",
  "american tactical": "American Tactical",
  "shadow systems": "Shadow Systems",
  "radical firearms": "Radical Firearms",
  "alpha foxtrot": "Alpha Foxtrot",
  "hopkins & allen": "Hopkins & Allen",
  "hopkins and allen": "Hopkins & Allen",
  eaa: "EAA",
  cai: "CAI",
};

/** Common caliber/gauge tokens, most-specific first. */
const CALIBER_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b6\.5\s*creedmoor\b/i, label: "6.5 Creedmoor" },
  { re: /\b300\s*(blackout|blk|aac)\b/i, label: "300 Blackout" },
  { re: /\b5\.56(\s*nato|x45)?\b/i, label: "5.56" },
  { re: /\b5\.7(x28)?\b/i, label: "5.7x28" },
  { re: /\b7\.62\s*x?\s*39\b/i, label: "7.62x39" },
  { re: /\b7\.62\s*x?\s*51\b/i, label: "7.62x51" },
  { re: /\b\.?308(\s*win)?\b/i, label: ".308" },
  { re: /\b\.?223(\s*(rem|wylde))?\b/i, label: ".223" },
  { re: /\b\.?30-30\b/i, label: ".30-30" },
  { re: /\b\.?30-06\b/i, label: ".30-06" },
  { re: /\b\.?270(\s*win)?\b/i, label: ".270" },
  { re: /\b\.?243\b/i, label: ".243" },
  { re: /\b(9\s*mm(\s*luger)?|9\s*x\s*19)\b/i, label: "9mm" },
  { re: /\b\.?45\s*colt\b/i, label: ".45 Colt" },
  { re: /\b\.?45\s*(acp|auto)\b/i, label: ".45 ACP" },
  { re: /\b\.?40\s*(s&w|sw|cal)?\b/i, label: ".40 S&W" },
  { re: /\b\.?380(\s*(acp|auto))?\b/i, label: ".380 ACP" },
  { re: /\b\.?357\s*(mag|magnum|sig)\b/i, label: ".357" },
  { re: /\b\.?38\s*(special|spl|spc)\b/i, label: ".38 Special" },
  { re: /\b10\s*mm\b/i, label: "10mm" },
  { re: /\b\.?44-40\b/i, label: ".44-40" },
  { re: /\b\.?44\s*(mag|magnum|rem\s*mag)\b/i, label: ".44 Magnum" },
  { re: /\b\.?22\s*hornet\b/i, label: ".22 Hornet" },
  { re: /\b\.?22\s*(wmr|magnum)\b/i, label: ".22 WMR" },
  { re: /\b\.?22\s*(lr|long\s*rifle|caliber|cal)\b/i, label: ".22 LR" },
  { re: /\b12[-\s]*(ga|gauge|guage)\b/i, label: "12ga" },
  { re: /\b16[-\s]*(ga|gauge|guage)\b/i, label: "16ga" },
  { re: /\b20[-\s]*(ga|gauge|guage)\b/i, label: "20ga" },
  { re: /\b28[-\s]*(ga|gauge|guage)\b/i, label: "28ga" },
  { re: /\b\.?410(\s*(ga|gauge|bore))?\b/i, label: ".410" },
];

const CATEGORY_HINTS: { re: RegExp; category: string }[] = [
  { re: /\b(pistol|handgun|revolver)\b/i, category: "handgun" },
  { re: /\b(shotgun|gauge|guage|\bga\b|over\/under|o\/u|pump|double-?barrel)\b/i, category: "shotgun" },
  { re: /\b(rifle|carbine|ar-?15|ar15|ar-?10|bolt\s*action|lever\s*action)\b/i, category: "rifle" },
];

/**
 * Normalize a free-text category (auction sheets use plurals and odd buckets like
 * "Bolt/Rimfire Long Guns") to the desk's handgun / rifle / shotgun hints.
 * Unknown buckets (e.g. "Special Interest") pass through lowercased.
 */
export function normalizeCategory(raw: string): string {
  const c = raw.trim().toLowerCase();
  if (!c) return "";
  if (/\b(hand\s*gun|handgun|pistol|revolver)s?\b/.test(c)) return "handgun";
  if (/\b(shot\s*gun|shotgun)s?\b/.test(c)) return "shotgun";
  if (/\b(rifle|carbine|long\s*gun|rimfire|bolt)s?\b/.test(c)) return "rifle";
  return c;
}

export interface ParsedTitle {
  manufacturer: string;
  model: string;
  caliber: string;
  category: string;
}

/** Title cleanup before brand/model split (typos, dash spacing, ACP glued to digits). */
function normalizeTitleText(raw: string): string {
  return raw
    .replace(/\barmoty\b/gi, "Armory")
    .replace(/\bmoel\b/gi, "Model")
    .replace(/\b(\d{2,3})ACP\b/gi, "$1 ACP")
    // Collapse spaced / letter↔digit dashes (LC - 5.7, A1-FS) but KEEP caliber hyphens (.30-06, 44-40).
    .replace(/([A-Za-z])\s*-\s*([A-Za-z0-9])/g, "$1 $2")
    .replace(/([0-9])\s*-\s*([A-Za-z])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Importer listed first, real make second — prefer the make for OA. */
const IMPORTER_MAKE_PAIRS: Array<{ importer: string; make: string; alias?: string }> = [
  { importer: "stoeger", make: "llama", alias: "Llama" },
  { importer: "churchill", make: "akkar", alias: "Akkar" },
  { importer: "american tactical", make: "gsg", alias: "GSG" },
];

type BrandHit = { brand: string; index: number; length: number };

function findBrandHits(lower: string): BrandHit[] {
  const hits: BrandHit[] = [];
  for (const brand of BRANDS) {
    const re = new RegExp(`(^|\\b)${brand.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}(\\b|$)`, "i");
    const m = re.exec(lower);
    if (m) {
      const index = m.index + (m[1] ? m[1].length : 0);
      hits.push({ brand, index, length: brand.length });
    }
  }
  // Leftmost wins; at same index, longest multi-word brand wins.
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  return hits;
}

export function parseTitleBlob(title: string): ParsedTitle {
  const text = normalizeTitleText(title);
  const lower = text.toLowerCase();

  let manufacturer = "";
  let brandMatch = "";

  const hits = findBrandHits(lower);
  if (hits.length > 0) {
    let chosen = hits[0]!;

    // Trailing "<Brand> Rifle/Shotgun/Pistol" is usually the category maker, not the gun brand.
    // If a different brand appears earlier, prefer that.
    const trailingCat = lower.match(/\b(springfield|winchester|remington|mossberg)\s+(rifle|shotgun|pistol|carbine)\s*$/i);
    if (trailingCat && hits.length > 1) {
      const trailingBrand = trailingCat[1]!.toLowerCase();
      if (chosen.brand === trailingBrand || chosen.brand.startsWith(trailingBrand)) {
        const earlier = hits.find((h) => h.index < chosen.index);
        if (earlier) chosen = earlier;
      }
    }

    // Importer + make compounds (Stoeger Llama, Churchill Akkar, …)
    for (const pair of IMPORTER_MAKE_PAIRS) {
      const hasImporter = hits.some((h) => h.brand === pair.importer || h.brand.startsWith(pair.importer));
      const makeHit = hits.find((h) => h.brand === pair.make || h.brand.includes(pair.make));
      if (hasImporter && makeHit) {
        chosen = makeHit;
        manufacturer = pair.alias ?? (BRAND_ALIASES[makeHit.brand] ?? makeHit.brand.replace(/\b\w/g, (c) => c.toUpperCase()));
        brandMatch = makeHit.brand;
        break;
      }
    }

    if (!manufacturer) {
      manufacturer = BRAND_ALIASES[chosen.brand] ?? chosen.brand.replace(/\b\w/g, (c) => c.toUpperCase());
      brandMatch = chosen.brand;
    }
  }

  // Fallback when brand isn't in the lexicon: leading name + optional company noun.
  if (!manufacturer) {
    const lead = text.match(
      /^([A-Za-z][A-Za-z0-9.&'/-]*(?:\s+[A-Za-z][A-Za-z0-9.&'/-]*){0,3}?)(?=\s+(?:Model|Moel|[A-Z0-9][A-Za-z0-9-]{0,12}\d|\d|\.|#))/i,
    );
    const soft = text.match(
      /^((?:[A-Za-z][A-Za-z0-9.&'/-]*\s+){0,2}(?:Firearms|Arms|Systems|Defense|Industries|Armory|Manufacturing|Ordnance|Machinery|Inc\.?|Co\.?))(?:\s+|$)/i,
    );
    const raw = (soft?.[1] || lead?.[1] || "").replace(/,/g, "").trim();
    if (raw.split(/\s+/).length >= 1 && raw.length >= 2 && !/^(break|single|double|semi|with|the)$/i.test(raw)) {
      manufacturer = raw.replace(/\b\w/g, (c) => c.toUpperCase());
      brandMatch = raw.toLowerCase();
    }
  }

  let caliber = "";
  let caliberRaw = "";
  for (const { re, label } of CALIBER_PATTERNS) {
    const m = text.match(re);
    if (m) {
      caliber = label;
      caliberRaw = m[0];
      break;
    }
  }

  let category = "handgun";
  for (const { re, category: cat } of CATEGORY_HINTS) {
    if (re.test(text)) {
      category = cat;
      break;
    }
  }

  // Model = title minus brand and caliber tokens, minus common noise words.
  let model = text;
  if (brandMatch) {
    model = model.replace(new RegExp(brandMatch.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&"), "i"), " ");
  }
  // Drop other secondary brand tokens (e.g. trailing "Springfield" / "Winchester" after Remington/Ruger).
  for (const hit of hits) {
    if (hit.brand === brandMatch) continue;
    model = model.replace(new RegExp(`\\b${hit.brand.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}\\b`, "i"), " ");
  }
  if (caliberRaw) {
    model = model.replace(caliberRaw, " ");
  }
  model = model
    .replace(
      /\b(new|used|nib|like new|excellent|model|pistol|handgun|rifle|shotgun|revolver|semi-?automatic|semi-?auto|luger|cal|caliber|gauge|guage|ga|magnum|mag|nato|wylde|scope|in box|box|additional barrel|hand-?crank|single-?action|double-?barrel|single shot|over\/under|o\/u|w\/.*$)\b/gi,
      " ",
    )
    // Keep "carbine" when it looks like a model name (LC Carbine); strip only trailing category use.
    .replace(/\bcarbine\b/gi, "Carbine")
    .replace(/[*#|]+/g, " ")
    .replace(/(?:^|\s)[-–—./]+(?=\s|$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Titles that are only make + caliber + type leave an empty model after cleanup → batch skip.
  // Prefer caliber as a searchable model stub (e.g. Rossi .38 Special / Llama .38 Special).
  if (!model && manufacturer && caliber) {
    model = caliber;
  }

  return { manufacturer, model, caliber, category: normalizeCategory(category) || category };
}

// --- Sheet parsing ------------------------------------------------------------

export function parseBatchSheet(
  text: string,
  opts?: { defaultBuyerPremiumPct?: number; defaultCategory?: string },
): ParseBatchResult {
  const warnings: string[] = [];
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], mapping: {}, warnings: ["No rows found."] };
  }

  const delimiter = pickDelimiter(lines[0]!);
  const headers = splitLine(lines[0]!, delimiter);
  const mapping: Record<string, string> = {};
  const colIndex: Partial<Record<Field, number>> = {};

  headers.forEach((h, i) => {
    const field = resolveHeader(h);
    if (field && colIndex[field] == null) {
      colIndex[field] = i;
      mapping[h] = field;
    }
  });

  const hasTitle = colIndex.title != null;
  const hasMakeAndModel = colIndex.manufacturer != null && colIndex.model != null;
  // Many auction CSVs put the entire gun line in a single "Model" column (no Make / Title).
  const hasModelDescription =
    colIndex.model != null && colIndex.manufacturer == null && colIndex.title == null;
  const hasIdentity = hasTitle || hasMakeAndModel || hasModelDescription;

  if (!hasIdentity) {
    warnings.push(
      "Need a Title/Item Description column, OR Make + Model, OR a Model column with the full gun line (e.g. \"Glock 19 Gen5 9mm\").",
    );
    return { rows: [], mapping, warnings };
  }

  if (hasModelDescription) {
    warnings.push(
      'Using the "Model" column as the full item description (no separate Make/Title). Each cell should read like "Remington 1100 12 Gauge", not just a model number.',
    );
  }

  const rows: BatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!, delimiter);
    const get = (f: Field): string =>
      colIndex[f] != null ? (cells[colIndex[f]!] ?? "").trim() : "";

    let rawTitle = get("title");
    let manufacturer = get("manufacturer");
    let modelCell = get("model");
    let model = modelCell;
    let caliber = get("caliber");
    const rawCategory = get("category");
    let category = normalizeCategory(rawCategory) || rawCategory || opts?.defaultCategory || "handgun";

    // Model-only export: one column holds brand + model + often caliber in prose.
    if (!rawTitle && !manufacturer && modelCell) {
      rawTitle = modelCell;
    }

    if ((!manufacturer || !model) && rawTitle) {
      const parsed = parseTitleBlob(rawTitle);
      manufacturer = manufacturer || parsed.manufacturer;
      model = model || parsed.model;
      caliber = caliber || parsed.caliber;
      // Prefer the description's own type when the sheet category is missing or a
      // generic bucket (e.g. "Special Interest") that we couldn't normalize.
      if (!["handgun", "rifle", "shotgun"].includes(category)) {
        category = parsed.category;
      }
    }

    const currentBid = parseMoney(get("currentBid"));
    const buyerPremiumPct = parsePct(get("buyerPremiumPct")) ?? opts?.defaultBuyerPremiumPct ?? null;
    const unresolved = !manufacturer.trim() || !model.trim();

    rows.push({
      rowNumber: i,
      lot: get("lot") || String(i),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      caliber: caliber.trim(),
      upc: get("upc").replace(/[^0-9]/g, ""),
      category,
      currentBid,
      buyerPremiumPct,
      rawTitle: rawTitle || modelCell,
      unresolved,
    });
  }

  const unresolvedCount = rows.filter((r) => r.unresolved).length;
  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} row(s) could not be resolved to a make/model and will be skipped.`);
  }

  return { rows, mapping, warnings };
}
