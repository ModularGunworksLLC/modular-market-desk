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

import {
  classifyLotTitle,
  lotKindLabel,
  type LotKind,
} from "@/lib/auctions/lot-kind";
import { rewriteBrandLexicon } from "@/lib/batch/brand-lexicon";
import { extractLotAnnotations, partsWarning } from "@/lib/batch/lot-annotations";
import { bidColumnWarnings, headerLooksLikeCompColumn, parseCsvMatrix } from "@/lib/batch/sheet-csv";

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
  /** Listing next required hammer (HiBid), when known. */
  requiredBid: number | null;
  /** Listing bid increment at this price level, when known. */
  bidIncrementAmount: number | null;
  buyerPremiumPct: number | null;
  /** The raw title blob, when present — surfaced for analyst review. */
  rawTitle: string;
  /** True when manufacturer/model could not be resolved (row is skipped). */
  unresolved: boolean;
  /** Title-kind gate: ammo/accessory/etc. are excluded from firearm pricing. */
  lotKind: LotKind;
  /** True when title is not a complete firearm (ammo, mag, gear). */
  excludeFromPricing: boolean;
  /** "w/ ..." extras. Not used in comp matching. */
  accessories: string[];
  /** sporter / drilled / nsn / parts. Not used in comp matching. */
  flags: string[];
  /** Set when the title says parts. */
  partsWarning: string | null;
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
  | "requiredBid"
  | "bidIncrementAmount"
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
    "currenthammer",
    "currentbidingested",
    "currentbidhammer",
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
  requiredBid: ["requiredbid", "nextbid", "minnextbid", "minimumnextbid", "minimumbid"],
  bidIncrementAmount: [
    "bidincrement",
    "bidincrementamount",
    "increment",
    "incrementamount",
    "bidstep",
  ],
  buyerPremiumPct: ["buyerspremium", "buyerpremium", "premium", "bp", "bppct", "premiumpct"],
};

function normHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveHeader(header: string): Field | null {
  if (headerLooksLikeCompColumn(header)) return null;
  const n = normHeader(header);
  if (!n) return null;
  if (n.includes("p25") || n.includes("median") || n.includes("maxhammer") || n.includes("walkaway")) {
    return null;
  }
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
  "j.c. higgins",
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
  "davis industries",
  "essex gun works",
  "double star",
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
  "franchi",
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
  "braztech",
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
  "retay",
  "yildiz",
  "hatfield",
  "mauser",
  "interarms",
  "noble",
  "optima",
  "amt",
  "girsan",
  "moore",
  "spanish",
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
  braztech: "Braztech",
};

/** Common caliber/gauge tokens, most-specific first. */
const CALIBER_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b6\.5\s*creedmoor\b/i, label: "6.5 Creedmoor" },
  { re: /\b6\.5\s*grendel\b/i, label: "6.5 Grendel" },
  { re: /\b300\s*(blackout|blk|aac)\b/i, label: "300 Blackout" },
  { re: /\b5\.56(\s*nato|x45)?\b/i, label: "5.56" },
  { re: /\b5\.7(x28)?\b/i, label: "5.7x28" },
  { re: /\b7\.62\s*x?\s*39\b/i, label: "7.62x39" },
  { re: /\b7\.62\s*x?\s*51\b/i, label: "7.62x51" },
  { re: /\b7\s*mm-?08\b/i, label: "7mm-08" },
  { re: /\b7\s*mm(?:\s*(?:rem(?:ington)?)?)?(?:\s*mag(?:num)?)?\b/i, label: "7mm Rem Mag" },
  { re: /\b\.?22-250\b/i, label: ".22-250" },
  { re: /\b\.?45\s*\/\s*\.?410\b/i, label: ".45 Colt" },
  { re: /\b\.?300\s*rum\b/i, label: ".300 RUM" },
  { re: /\b\.?338(\s*win)?\b/i, label: ".338 Win" },
  { re: /\b\.?25-06\b/i, label: ".25-06" },
  { re: /\b\.?17\s*(hmr|hornet)?\b/i, label: ".17 HMR" },
  { re: /\b\.?308(\s*win)?\b/i, label: ".308" },
  { re: /\b\.?223(\s*(rem|wylde))?\b/i, label: ".223" },
  { re: /\b\.?30-30\b/i, label: ".30-30" },
  { re: /\b\.?30-06\b/i, label: ".30-06" },
  { re: /\b\.?270(\s*win)?\b/i, label: ".270" },
  { re: /\b\.?243\b/i, label: ".243" },
  { re: /\b\.?35\s*rem(?:ington)?\b/i, label: ".35 Rem" },
  { re: /\b9\s*x\s*18\b/i, label: "9x18" },
  { re: /\b(9\s*mm(\s*luger)?|9\s*x\s*19)\b/i, label: "9mm" },
  { re: /\b\.?45-70\b/i, label: ".45-70" },
  { re: /\b\.?45\s*colt\b/i, label: ".45 Colt" },
  { re: /\b\.?45\s*(acp|auto)\b/i, label: ".45 ACP" },
  { re: /\b\.?40\s*(s&w|sw|cal)?\b/i, label: ".40 S&W" },
  { re: /\b\.?380(\s*(acp|auto))?\b/i, label: ".380 ACP" },
  { re: /\b\.?357\s*(mag|magnum|sig)\b/i, label: ".357" },
  { re: /\b\.?38\s*super\b/i, label: ".38 Super" },
  { re: /\b\.?38\s*(special|spl|spc)\b/i, label: ".38 Special" },
  { re: /\b10\s*mm\b/i, label: "10mm" },
  { re: /\b6\.35(\s*mm)?\b/i, label: ".25 ACP" },
  { re: /\b\.?25\s*(acp|auto)\b/i, label: ".25 ACP" },
  { re: /\b\.?32\s*(acp|auto)\b/i, label: ".32 ACP" },
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
  // Auction sheets often use bare BOLT / LEVER / SEMI instead of "bolt action rifle".
  { re: /\b(rifle|carbine|ar-?15|ar15|ar-?10|sks|bolt(?:\s*action)?|lever(?:\s*action)?)\b/i, category: "rifle" },
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
  accessories: string[];
  flags: string[];
  partsWarning: string | null;
}

/**
 * Title category. Handgun is not assumed here — callers fall back only when
 * this returns "". "pistol grip" is not a handgun. AR suffixes (LAR-15, WW-15)
 * do not need a word boundary before "ar".
 */
export function inferCategoryFromTitle(title: string): "handgun" | "rifle" | "shotgun" | "" {
  const masked = title.replace(/\bpistol\s+grip\b/gi, " ");
  const shotgun = /\b(shotgun|gauge|guage|over\/under|o\/u|double-?barrel)\b|\b(12|16|20|28|410)\s*-?\s*(ga|gauge|guage|bore)\b|\bsaiga\s*-?\s*12\b/i;
  const rifle =
    /\b(rifle|carbine|ar-?15|ar15|ar-?10|sks|bolt(?:\s*action)?|lever(?:\s*action)?)\b|(?:lar|ww|rf|am|stag)\s*-?\s*15|\bm\s*&\s*p\s*-?\s*15\b|\b94\s*ae\b|\b(?:model\s*)?700\b|\baxis\b|\bm77\b|\bh012x\b|\bwasr\b|\b(5\.56|\.223|\.308|\.30-30|\.30-06|\.243|\.270|\.257|\.400\s*legend|7\.62\s*x\s*39|7\.62\s*x\s*54|7\s*x\s*57|8\s*x\s*57|22-250)\b/i;
  const handgun = /\b(pistol|handgun|revolver)\b/i;
  if (shotgun.test(masked)) return "shotgun";
  if (rifle.test(masked)) return "rifle";
  if (handgun.test(masked)) return "handgun";
  if (/\b(pump|double-?barrel)\b/i.test(masked)) return "shotgun";
  return "";
}

/**
 * Title cleanup before brand/model split.
 * Auction CSVs (esp. Pearce / HiBid) glue caliber as `308CAL`, append lot junk
 * as `TRANS 4415`, and use `10-22` instead of `10/22`.
 */
function normalizeTitleText(raw: string): string {
  const keptHyphens: string[] = [];
  let s = raw
    .replace(/\b((?:lar|ww|rf|am|stag)\s*-\s*15|saiga\s*-\s*\d+)\b/gi, (token) => {
      const mark = `__HY${keptHyphens.length}__`;
      keptHyphens.push(token.replace(/\s+/g, ""));
      return mark;
    })
    .replace(/\barmoty\b/gi, "Armory")
    .replace(/\bmoel\b/gi, "Model")
    // Pearce transfer / lot markers: TRANS 4415, TRANS 4401,4415
    .replace(/\bTRANS\b[\s:,#-]*[\d]+(?:\s*[,/]\s*[\d]+)*/gi, " ")
    .replace(/\bCIRCUT\b/gi, "Circuit") // Pearce typo
    .replace(/\bPRODGY\b/gi, "Prodigy")
    .replace(/\bSINGLR\b/gi, "Single")
    .replace(/\b(\d{2,3})ACP\b/gi, "$1 ACP");

  // Glued metric + CAL: 7.62X39CAL → 7.62x39 (optional trailing .)
  s = s.replace(/\b(\d+\.\d+)\s*[xX]\s*(\d+)\s*CAL\.?\b/gi, "$1x$2");
  // Dual-cal Judge lines: 45/410CAL → .45/.410
  s = s.replace(/\b\.?(45)\s*\/\s*\.?(410)\s*CAL\.?\b/gi, ".$1/.$2");
  // Named magnums glued: 22MAG, 338WIN, 300 REM ULTRA, 38SPE.
  s = s.replace(/\b\.?22\s*MAG(?:NUM)?\b/gi, ".22 WMR");
  s = s.replace(/\b\.?338\s*WIN(?:CHESTER)?\b/gi, ".338 Win");
  s = s.replace(/\b300\s*REM(?:INGTON)?\s*ULTRA(?:\s*MAG(?:NUM)?)?\b/gi, ".300 RUM");
  s = s.replace(/\b\.?38\s*SPE(?:C(?:IAL)?)?\.?\b/gi, ".38 Special");
  s = s.replace(/\b\.?25-06\s*CAL\.?\b/gi, ".25-06");
  s = s.replace(/\b25-06CAL\.?\b/gi, ".25-06");
  // Rimfire / common handgun shorts glued to CAL (optional trailing .) — do not touch "22 Cal"
  s = s.replace(/\b\.?22CAL\.?\b/gi, ".22 LR");
  s = s.replace(/\b\.?17CAL\.?\b/gi, ".17 HMR");
  s = s.replace(/\b\.?380CAL\.?\b/gi, ".380 ACP");
  s = s.replace(/\b\.?45CAL\.?\b/gi, ".45 ACP");
  s = s.replace(/\b\.?40CAL\.?\b/gi, ".40 S&W");
  s = s.replace(/\b\.?25CAL\.?\b/gi, ".25 ACP");
  s = s.replace(/\b\.?32CAL\.?\b/gi, ".32 ACP");
  s = s.replace(/\b\.?41CAL\.?\b/gi, ".41");
  s = s.replace(/\b\.?50CAL\.?\b/gi, ".50");
  s = s.replace(/\b9MMCAL\.?\b/gi, "9mm");
  s = s.replace(/\b7\.65CAL\.?\b/gi, ".32 ACP");
  // 556CAL / 223CAL style NATO shorts
  s = s.replace(/\b556CAL\.?\b/gi, "5.56");
  s = s.replace(/\b223CAL\.?\b/gi, ".223");
  // Generic ###CAL / ###CAL. (glued only) → .### so existing caliber patterns can match
  s = s.replace(/\b(\d{2,3})CAL\.?\b/gi, ".$1");
  // Decimal glued: 7.62CAL → 7.62
  s = s.replace(/\b(\d+\.\d+)CAL\.?\b/gi, "$1");

  // Ruger 10-22 / Marlin 1894-style: keep caliber hyphens, fix model slash forms
  s = s.replace(/\b10\s*-\s*22\b/gi, "10/22");
  s = s.replace(/\b22\s*-\s*250\b/gi, "22-250");
  s = s.replace(/\b25\s*-\s*06\b/gi, "25-06");
  s = s.replace(/\b30\s*-\s*06\b/gi, "30-06");
  s = s.replace(/\b30\s*-\s*30\b/gi, "30-30");
  s = s.replace(/\b45\s*-\s*70\b/gi, "45-70");

  // Collapse double dots from ###CAL expansion (5..56, 6..35) BEFORE metric→ACP maps
  s = s.replace(/(\d)\.{2,}(\d)/g, "$1.$2");
  s = s.replace(/\b6[,.]35(?:\s*mm)?\b/gi, ".25 ACP");
  // Remington "7 SEVEN" marketing → Model Seven
  s = s.replace(/\b7\s+SEVEN\b/gi, "Seven");
  // Baby Browning stays; XD9 / XD45 spacing for OA
  s = s.replace(/\bXD\s*9\b/gi, "XD9");
  s = s.replace(/\bXD\s*45\b/gi, "XD45");
  s = s.replace(/\bT\/?CR22\b/gi, "TCR22");
  s = s.replace(/\bBODY\s*GUARD\b/gi, "Bodyguard");
  // Pearce / OCR leftovers
  s = s.replace(/\bBLACK\s+MARK\b/gi, "Buck Mark");
  s = s.replace(/\bACPSEMI\b/gi, "ACP SEMI");
  s = s.replace(/\b([A-Z]{2,})SEMI\b/gi, "$1 SEMI");
  s = s.replace(/\bM887\b/gi, "887");
  // Bare "45" / "9" after 1911 / Custom often means the cartridge
  s = s.replace(/\b(CUSTOM(?:\s+II)?|1911|M1911)\s+45\b/gi, "$1 .45 ACP");
  s = s.replace(/\b(CUSTOM(?:\s+II)?|1911|M1911)\s+9\b/gi, "$1 9mm");

  return s
    // Collapse spaced / letter↔digit dashes (LC - 5.7, A1-FS) but KEEP caliber hyphens (.30-06, 44-40).
    // LAR-15 / SAIGA-12 were parked in __HYn__ tokens above.
    .replace(/([A-Za-z])\s*-\s*([A-Za-z0-9])/g, "$1 $2")
    .replace(/([0-9])\s*-\s*([A-Za-z])/g, "$1 $2")
    .replace(/__HY(\d+)__/g, (_, i: string) => keptHyphens[Number(i)] ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Importer listed first, real make second — prefer the make for OA. */
const IMPORTER_MAKE_PAIRS: Array<{ importer: string; make: string; alias?: string }> = [
  { importer: "stoeger", make: "llama", alias: "Llama" },
  { importer: "churchill", make: "akkar", alias: "Akkar" },
  { importer: "american tactical", make: "gsg", alias: "GSG" },
  // Braztech marks on Taurus/Rossi Circuit Judge auction lines
  { importer: "braztech", make: "taurus", alias: "Taurus" },
  { importer: "braztech", make: "rossi", alias: "Rossi" },
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
  const normalized = normalizeTitleText(title);
  const extracted = extractLotAnnotations(normalized);
  const lex = rewriteBrandLexicon(extracted.text);
  const text = lex.text;
  const annotations = extracted.annotations;
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

  // Lexicon wins over the generic leading-words guess so suffixes stay out of the model.
  if (lex.manufacturer) {
    manufacturer = lex.manufacturer;
    brandMatch = lex.manufacturer.toLowerCase();
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

  const category = inferCategoryFromTitle(`${text} ${annotations.accessories.join(" ")}`) || "handgun";

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
    .replace(/\bpistol\s+grip\b/gi, " ")
    .replace(
      /\b(new|used|nib|like new|excellent|model|pistol|handgun|rifle|shotgun|revolver|semi-?automatic|semi-?auto|semi|bolt(?:\s*action)?|lever(?:\s*action)?|pump(?:\s*action)?|action|luger|cal|caliber|gauge|guage|ga|magnum|mag|nato|wylde|scope|in box|box|additional barrel|hand-?crank|single[-\s]?action|double[-\s]?barrel|single\s+shot|single|double|over\/under|over\s*\/\s*under|o\/u|black\s*powder|set\s+of|trans|russia|repeating\s+arms|arms\s+factory)\b/gi,
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

  // Braztech-marked Judge lines with no Taurus/Rossi token → Rossi Circuit Judge (OA leaf).
  if (/^braztech$/i.test(manufacturer) && /\bcircuit\s+judge\b/i.test(model)) {
    manufacturer = "Rossi";
  } else if (/^braztech$/i.test(manufacturer) && /\bjudge\b/i.test(model)) {
    manufacturer = "Taurus";
  }

  // Bare "SKS …" titles: SKS is the model, not a maker (OA: Norinco/Tula/Izhevsk SKS).
  if (/^sks$/i.test(manufacturer)) {
    manufacturer = "Norinco";
    model = "SKS";
  }

  // "SKS TYPE 56" / "TYPE 56" Chinese SKS variant
  if (/type\s*56/i.test(`${manufacturer} ${model}`)) {
    manufacturer = /norinco/i.test(manufacturer) ? manufacturer : "Norinco";
    model = "Type 56";
    if (!caliber) caliber = "7.62x39";
  }

  // FN-made Baby Browning is cataloged under FNH, not Browning
  if (/baby\s+browning/i.test(model)) {
    manufacturer = "FNH";
    model = "Baby Browning";
  }

  // Avoid model==caliber stubs like "12ga" / ".338 Win" with no real model token
  if (model && caliber && normModelToken(model) === normModelToken(caliber)) {
    model = "";
  }

  // "SAIGA-12" is one model token. Title cleanup splits the hyphen into "SAIGA 12".
  if (/^izhmash$/i.test(manufacturer) && /saiga\s*-?\s*12/i.test(`${text} ${model}`)) {
    model = "SAIGA-12";
  }

  return {
    manufacturer,
    model,
    caliber,
    category: normalizeCategory(category) || category,
    accessories: annotations.accessories,
    flags: annotations.flags,
    partsWarning: partsWarning(annotations.flags),
  };
}

function normModelToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// --- Sheet parsing ------------------------------------------------------------

export function parseBatchSheet(
  text: string,
  opts?: { defaultBuyerPremiumPct?: number; defaultCategory?: string },
): ParseBatchResult {
  const warnings: string[] = [];
  const matrix = parseCsvMatrix(text);
  const lines = matrix.rows;
  if (lines.length === 0) {
    return { rows: [], mapping: {}, warnings: ["No rows found."] };
  }

  const headers = lines[0]!.map((h) => h.trim());
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
    const cells = (lines[i] ?? []).map((c) => c.trim());
    const get = (f: Field): string =>
      colIndex[f] != null ? (cells[colIndex[f]!] ?? "").trim() : "";

    let rawTitle = get("title");
    let manufacturer = get("manufacturer");
    let modelCell = get("model");
    let model = modelCell;
    let caliber = get("caliber");
    const rawCategory = get("category");
    let category = normalizeCategory(rawCategory);
    const explicitCategory = category === "handgun" || category === "rifle" || category === "shotgun";
    let accessories: string[] = [];
    let flags: string[] = [];
    let rowPartsWarning: string | null = null;

    // Model-only export: one column holds brand + model + often caliber in prose.
    if (!rawTitle && !manufacturer && modelCell) {
      rawTitle = modelCell;
    }

    const titleForParse = rawTitle || (!manufacturer && modelCell ? modelCell : "");
    if (titleForParse) {
      const parsed = parseTitleBlob(titleForParse);
      if (!manufacturer || !model) {
        manufacturer = manufacturer || parsed.manufacturer;
        model = model || parsed.model;
        caliber = caliber || parsed.caliber;
      }
      accessories = parsed.accessories;
      flags = parsed.flags;
      rowPartsWarning = parsed.partsWarning;
      if (!explicitCategory) category = parsed.category;
    }
    if (!explicitCategory && !category) {
      category = inferCategoryFromTitle(`${manufacturer} ${model} ${caliber}`) || opts?.defaultCategory || "handgun";
    }
    if (!category) category = "handgun";

    const currentBid = parseMoney(get("currentBid"));
    const requiredBid = parseMoney(get("requiredBid"));
    const bidIncrementAmount = parseMoney(get("bidIncrementAmount"));
    const buyerPremiumPct = parsePct(get("buyerPremiumPct")) ?? opts?.defaultBuyerPremiumPct ?? null;
    const titleForKind = (rawTitle || `${manufacturer} ${model} ${caliber}`).trim();
    const lotKind = classifyLotTitle(titleForKind, { category });
    const excludeFromPricing = lotKind !== "firearm";
    const unresolved = !manufacturer.trim() || !model.trim() || excludeFromPricing;

    rows.push({
      rowNumber: i,
      lot: get("lot") || String(i),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      caliber: caliber.trim(),
      upc: get("upc").replace(/[^0-9]/g, ""),
      category,
      currentBid,
      requiredBid,
      bidIncrementAmount,
      buyerPremiumPct,
      rawTitle: rawTitle || modelCell,
      unresolved,
      lotKind,
      excludeFromPricing,
      accessories,
      flags,
      partsWarning: rowPartsWarning,
    });
  }

  warnings.push(
    ...bidColumnWarnings({
      headers,
      mappedCurrentBid: colIndex.currentBid != null,
      bids: rows.map((r) => r.currentBid),
    }),
  );

  const unresolvedCount = rows.filter((r) => !r.manufacturer.trim() || !r.model.trim()).length;
  const excludedCount = rows.filter((r) => r.excludeFromPricing).length;
  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} row(s) could not be resolved to a make/model and will be skipped.`);
  }
  if (excludedCount > 0) {
    const byKind = new Map<string, number>();
    for (const r of rows) {
      if (!r.excludeFromPricing) continue;
      const label = lotKindLabel(r.lotKind);
      byKind.set(label, (byKind.get(label) ?? 0) + 1);
    }
    const parts = [...byKind.entries()].map(([k, n]) => `${n} ${k}`);
    warnings.push(
      `${excludedCount} non-firearm lot(s) excluded from pricing (${parts.join(", ")}).`,
    );
  }

  return { rows, mapping, warnings };
}
