/**
 * Pure GunBroker Analytics catalog resolver + confidence scorer.
 *
 * The portal exposes a `/pricing/dependencies` tree keyed by condition (NEW / USED),
 * where each node is a manufacturer holding models, and each model holds calibers.
 * To pull live comps we must map free-text desk fields (manufacturer / model / caliber)
 * onto the catalog's numeric ManufacturerID / ModelID / CaliberID.
 *
 * This module is a faithful TypeScript port of the legacy
 * engine/mmd_engine/adapters/outdoor_analytics.py resolver, with the caliber matching
 * hardened to alias common cartridges (9mm family, .45 ACP, 5.56/.223, etc.).
 *
 * Everything here is pure (no I/O), so it is unit-testable and safe to import anywhere.
 */

import { oaMakersForIdentity, oaModelAliasFor } from "@/lib/batch/brand-lexicon";

/** Desk-side identity used to resolve a catalog selection. */
export interface GbaQuery {
  manufacturer: string;
  model: string;
  /** Optional sub-model / generation text (e.g. "Gen 5"). */
  variant?: string;
  caliber?: string;
  /** Desk category hint (handgun, rifle, …) — tightens comp hygiene to complete firearms. */
  category?: string;
  /** Manufacturer part number, used as an extra model alias. */
  mpn?: string;
  condition?: "new" | "used" | "any";
}

/** A single caliber leaf in the dependencies tree. */
export interface OaCaliberNode {
  Caliber?: string | null;
  CaliberID?: number | string | null;
  /**
   * Sold comps on this leaf. The live catalog JSON usually omits it; tests and
   * `loadDepsAndResolve` attach it so a close score can prefer the larger sample.
   */
  SoldCount?: number | null;
}

/** A model node holding caliber leaves. */
export interface OaModelNode {
  Model?: string | null;
  ModelID?: number | string | null;
  Calibers?: OaCaliberNode[] | null;
}

/** A manufacturer node holding model nodes. */
export interface OaManufacturerNode {
  Manufacturer?: string | null;
  ManufacturerID?: number | string | null;
  IsCommonManufacturer?: boolean;
  Models?: OaModelNode[] | null;
}

/**
 * The `/pricing/dependencies` payload: keyed by condition bucket ("NEW" / "USED"),
 * each value a list of manufacturer nodes.
 */
export type OaDependencies = Record<string, OaManufacturerNode[] | undefined>;

/** A resolved catalog selection with its confidence score. */
export interface OaSelection {
  /** "NEW" | "USED" bucket the match came from. */
  conditionKey: string;
  /** API condition param ("New" | "Used"). */
  conditionParam: "New" | "Used";
  manufacturerId: number;
  manufacturer: string;
  modelId: number;
  model: string;
  caliberId: number;
  caliber: string;
  /** Blended confidence score in [0, 100+]. Higher is better. */
  score: number;
  /** Sold comps on the leaf, when known. 0 means unknown or empty. */
  soldCount?: number;
}

/** Below this blended score the match is shown but Max hammer is suppressed. */
export const MIN_MATCH_CONFIDENCE = 70;

/**
 * When two leaves are both at or above {@link MIN_MATCH_CONFIDENCE} and their
 * scores differ by at most this many points, the larger sold sample wins.
 */
export const MATCH_SCORE_TIE_MARGIN = 5;

const MIN_MANUFACTURER_SCORE = 40;
const MIN_MODEL_SCORE = 45;
const MIN_CALIBER_SCORE = 40;

/* ------------------------------------------------------------------ *
 * Text normalization
 * ------------------------------------------------------------------ */

/** Collapse to lowercase alphanumerics only (drops spaces, dots, dashes). */
export function norm(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Levenshtein edit distance between two strings.
 * Used for typo-tolerant manufacturer/model/caliber matching on Evaluate submit.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const cur = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j] ?? 0;
  }
  return prev[b.length] ?? b.length;
}

/** Max allowed edits for typo match — short stubs must not invent a brand. */
export function maxTypoDistance(normalizedLen: number): number {
  if (normalizedLen < 3) return 0;
  if (normalizedLen <= 5) return 1;
  return 2;
}

/** True when `query` is a close misspelling of `candidate` (both already normalized). */
export function isNearMiss(query: string, candidate: string): boolean {
  if (!query || !candidate) return false;
  if (query === candidate) return true;
  const maxDist = maxTypoDistance(query.length);
  if (maxDist <= 0) return false;
  if (Math.abs(query.length - candidate.length) > maxDist) return false;
  return editDistance(query, candidate) <= maxDist;
}

/**
 * Model near-miss: allow SP10l→SP101, but not P320→P220 / CSX→CS9 / PPS→PPQ.
 * Same-length digit runs that differ are different guns, not typos.
 * Letter-only names (Commando vs Commander) allow a single edit, not two.
 */
export function isModelNearMiss(query: string, candidate: string): boolean {
  if (!query || !candidate) return false;
  if (query === candidate) return true;
  const qDigits = query.replace(/\D/g, "");
  const cDigits = candidate.replace(/\D/g, "");
  if (qDigits.length >= 2 && cDigits.length >= 2 && qDigits.length === cDigits.length && qDigits !== cDigits) {
    return false;
  }
  if (!qDigits !== !cDigits) return false;
  if (!qDigits && !cDigits) {
    if (query.length <= 4 && candidate.length <= 4) return false;
    if (Math.abs(query.length - candidate.length) > 1) return false;
    return editDistance(query, candidate) <= 1;
  }
  return isNearMiss(query, candidate);
}

/** First 2+ digit run in a model string (29-10 → 29, P320 → 320). */
export function primaryModelNumber(model: string | undefined): string | null {
  const nums = (model ?? "").match(/\d+/g) ?? [];
  return nums.find((n) => n.length >= 2) ?? nums[0] ?? null;
}

/**
 * Letter+digit family codes (P320, P220, G19, SD40VE) plus 3–4 letter codes (CSX, PPS).
 * Used so a P320 cannot score against a P220 just because both start with P.
 */
export function extractFamilyTokens(text: string): string[] {
  const raw = (text ?? "").toLowerCase();
  if (!raw.trim()) return [];
  const out = new Set<string>();
  const compact = raw.replace(/[^a-z0-9]+/g, "");
  if (/^[a-z]{3,4}$/.test(compact)) out.add(compact);
  for (const m of raw.matchAll(/\b[a-z]{1,4}\d{2,5}[a-z]{0,4}\b/g)) {
    out.add(m[0]!);
  }
  for (const m of compact.matchAll(/[a-z]{1,4}\d{2,5}[a-z]{0,4}/g)) {
    out.add(m[0]!);
  }
  // G4X / GX4 / P22Q — one digit between letters
  for (const m of raw.matchAll(/\b[a-z]{1,3}\d[a-z]{1,3}\b/g)) {
    out.add(m[0]!);
  }
  for (const m of compact.matchAll(/[a-z]{1,3}\d[a-z]{1,3}/g)) {
    out.add(m[0]!);
  }
  return [...out];
}

const LETTER_CODE_GENERIC = new Set([
  "gen",
  "mag",
  "auto",
  "std",
  "sub",
  "tac",
  "pro",
  "the",
  "and",
  "for",
  "new",
  "used",
  "with",
  "el",
  "le",
  "la",
  "de",
]);

/** 3–4 letter model codes (CSX, PPS, CCP, RAMI) — not generic English stubs. */
export function distinctiveLetterCodes(text: string): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => /^[a-z]{3,4}$/.test(t) && !LETTER_CODE_GENERIC.has(t));
}

export function familyTokensCompatible(queryModel: string, catalogOrTitle: string): boolean {
  const qLetters = distinctiveLetterCodes(queryModel);
  if (qLetters.length > 0) {
    const catalogLower = catalogOrTitle.toLowerCase();
    const cLetters = distinctiveLetterCodes(catalogOrTitle);
    const letterHit = qLetters.some(
      (t) => cLetters.includes(t) || new RegExp(`\\b${escapeRegExp(t)}\\b`).test(catalogLower),
    );
    if (!letterHit) return false;
  }

  const q = extractFamilyTokens(queryModel);
  if (q.length === 0) return true;
  const c = extractFamilyTokens(catalogOrTitle);
  if (c.some((t) => q.includes(t))) return true;
  const cn = catalogOrTitle.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return q.some((t) => cn.includes(t));
}

/** Compact / Commander / etc. on the desk must appear on the catalog leaf. */
const SIZE_TOKENS = [
  "subcompact",
  "sub-compact",
  "sub compact",
  "compact",
  "commander",
  "commando",
  "officer",
  "centennial",
  "ladysmith",
];

export function missingQuerySizeToken(queryModel: string, catalogName: string): boolean {
  const q = queryModel.toLowerCase();
  const c = catalogName.toLowerCase();
  return SIZE_TOKENS.some((s) => q.includes(s) && !c.includes(s));
}

/** Collector / competition P320-class names that must not price a duty gun. */
const PREMIUM_VARIANT_RE =
  /\b(?:x-?five|x5|legion|axg|spectre|txg|equinox|custom\s*works)\b/i;

export function hasUnmatchedPremiumVariant(queryModel: string, catalogOrTitle: string): boolean {
  if (!PREMIUM_VARIANT_RE.test(catalogOrTitle)) return false;
  return !PREMIUM_VARIANT_RE.test(queryModel);
}

/** Recover a caliber glued into the model line when the caliber field was left blank. */
export function inferCaliberFromText(text: string): string {
  const lower = (text ?? "").toLowerCase();
  if (!lower.trim()) return "";
  for (const group of CALIBER_ALIAS_GROUPS) {
    const canonical = group[0] ?? "";
    if (!canonical) continue;
    for (const form of group) {
      if (caliberInTitle(form, lower)) return canonical;
    }
  }
  return "";
}

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------------ *
 * Caliber aliasing
 *
 * Each group lists interchangeable spellings of one cartridge. When the desk
 * caliber matches any member of a group, the whole group is treated as valid,
 * so a "9mm" query still matches a "9x19" or "9mm Luger" catalog entry.
 * ------------------------------------------------------------------ */

const CALIBER_ALIAS_GROUPS: string[][] = [
  ["22-250", "22 250", ".22-250", "22250"],
  ["22 hornet", ".22 hornet", "22hornet"],
  ["7mm rem mag", "7mm remington magnum", "7mm remington mag", "7mm rem mag", "7mm rem", "7 mm rem mag", "7mm mag"],
  ["7mm-08", "7mm 08", "7mm08", "7mm-08 rem"],
  ["35 rem", ".35 rem", "35 remington", ".35 remington"],
  ["9x18", "9 x 18", "9mm makarov", "9x18 makarov"],
  ["25 acp", "25 auto", ".25 acp", "6.35", "6.35mm", "6.35 browning"],
  ["32 acp", "32 auto", ".32 acp", "7.65", "7.65mm", "7.65 browning"],
  ["38 super", ".38 super", "38 super auto"],
  ["38 s&w", ".38 s&w", "38 sw"],
  ["45-70", "45 70", ".45-70", "4570"],
  ["6.5 grendel", "65 grendel"],
  ["9mm", "9 mm", "9x19", "9 x 19", "9mm luger", "9 luger", "9mm parabellum", "9mm para", "9mmp", "9mm nato"],
  ["380 acp", "380 auto", "380", "9mm short", "9x17", "9mm kurz"],
  ["40 s&w", "40 sw", "40 cal", "40 smith"],
  ["357 sig", "357sig"],
  ["357 magnum", "357 mag"],
  ["38 special", "38 spl", "38 spc", "38 special +p"],
  ["10mm", "10 mm", "10mm auto"],
  ["45 acp", "45 auto", "45acp"],
  ["45 colt", "45 long colt", "45 lc", "45lc"],
  ["44 magnum", "44 mag", "44 rem mag"],
  ["223 rem", "223 remington", "223", "5.56", "5.56x45", "5.56 nato", "556", "5.56mm"],
  ["308 win", "308 winchester", "308", "7.62x51", "7.62 nato", "762x51"],
  ["30-06", "30 06", "3006", "30-06 springfield"],
  ["30-30", "30 30", "3030", "30-30 win"],
  ["300 blackout", "300 blk", "300 aac", "300aac", "300  blackout"],
  ["7.62x39", "7.62 x 39", "762x39", "7.62 soviet"],
  ["22 lr", "22lr", "22 long rifle"],
  ["22 wmr", "22 magnum", "22 mag", "22wmr"],
  ["6.5 creedmoor", "6.5 cm", "65 creedmoor", "6.5creedmoor"],
  ["12 gauge", "12ga", "12 ga", "12 g"],
  ["20 gauge", "20ga", "20 ga", "20 g"],
  ["410", "410 bore", "410 gauge", "410ga"],
];

/**
 * All recognized title-friendly forms for a caliber: the raw spelling plus
 * dash/compact variants, expanded with any matching alias group.
 */
export function buildCaliberTokens(caliber: string | undefined | null): string[] {
  const raw = (caliber ?? "").trim().toLowerCase();
  if (!raw) return [];

  const forms = new Set<string>();
  const addVariants = (value: string) => {
    const v = value.trim().toLowerCase();
    if (!v) return;
    forms.add(v);
    forms.add(v.replace(/\s+/g, "-"));
    forms.add(v.replace(/\s+/g, ""));
    const compact = v.replace(/[^a-z0-9]/g, "");
    if (compact.length >= 2) forms.add(compact);
  };

  addVariants(raw);

  const normInput = norm(raw);
  for (const group of CALIBER_ALIAS_GROUPS) {
    if (group.some((a) => norm(a) === normInput)) {
      for (const alias of group) addVariants(alias);
    }
  }

  // Bare 22 / 45 / 40 / 357 match the wrong cartridge (.22 LR vs .22 WMR,
  // .45 ACP vs .45-70, .357 Mag vs .357 SIG).
  for (const bare of ["22", "45", "40", "357"]) forms.delete(bare);
  return Array.from(forms).filter((f) => f.length >= 2 && !["22", "45", "40", "357"].includes(f));
}

/** Whether any normalized caliber form is present in a (lowercased) title. */
function caliberInTitle(form: string, title: string): boolean {
  if (form.length < 2) return false;
  const compactForm = form.replace(/[^a-z0-9]/g, "");
  // Bare 2–3 digit forms must not match hyphenated cousins (22 vs 22-250, 45 vs 45-70).
  if (/^\d{2,3}$/.test(compactForm)) {
    const re = new RegExp(`(?<!\\d)${compactForm}(?![\\d-])`, "i");
    return re.test(title);
  }
  if (title.includes(form)) return true;
  if (title.includes(form.replace(/-/g, " "))) return true;
  if (title.replace(/\s+/g, "").includes(form.replace(/\s+/g, ""))) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Model aliasing
 * ------------------------------------------------------------------ */

/** Extra title tokens when catalog model codes differ from desk text. */
export function buildModelAliases(query: GbaQuery): string[] {
  const mfr = (query.manufacturer ?? "").toLowerCase();
  const mdl = (query.model ?? "").toLowerCase().trim();
  const aliases: string[] = [];

  if (mfr.includes("bear creek") || mfr.includes("bca")) {
    if (["dl", "bc-dl", "bca-dl"].includes(mdl)) {
      aliases.push("bc-10", "bc10", "bca-10", "bca-dl-308", "ar-10", "ar10");
    }
    if (["bc-10", "bc10", "bca-10"].includes(mdl)) {
      aliases.push("bc-10", "bc10", "bca-10", "bca-dl");
    }
  }

  if (mfr.includes("savage") && (mdl.includes("1911") || mdl === "1911")) {
    aliases.push(
      "savage-1911",
      "savage 1911",
      "sv1911",
      "sv1911gss",
      "1911 govt",
      "1911 government",
      "gov't",
      "govt",
      "government",
      "govt style",
    );
  }

  if (query.mpn) aliases.push(query.mpn.toLowerCase());

  if (mfr.includes("glock")) {
    const mdlNum = mdl.replace(/\D/g, "");
    if (mdlNum) aliases.push(`g${mdlNum}`, `glock ${mdlNum}`, `glock${mdlNum}`);
    const variant = (query.variant ?? "").toLowerCase();
    if (variant.includes("gen") && variant.includes("5")) aliases.push("gen5", "gen 5");
    if (variant.includes("gen") && variant.includes("4")) aliases.push("gen4", "gen 4");
  }

  return Array.from(new Set(aliases));
}

/**
 * OA catalog uses glued M&P codes: "M&P45", not "M&P 45".
 * Desk users often type the spaced form from auction titles.
 */
export function compactMpModel(model: string): string {
  let m = model.trim();
  m = m.replace(/M\s*&\s*P\s+/gi, "M&P");
  m = m.replace(/(M&P)\s+(\d)/gi, "$1$2");
  return m.trim();
}

/**
 * Strip auction-title noise so OA catalog match can see the real model.
 * Free, local — no AI. Examples:
 *   "Super Blackhawk in Gun Locker Hard Case" → "Super Blackhawk"
 *   "DR920 Elite with Holosun HS507C…" → "DR920 Elite"
 *   "Firearms G3C" / "G3C 9x19mm" → "G3C"
 */
export function cleanModelForOa(model: string): string {
  let m = model.trim();
  if (!m) return m;

  m = m.replace(/\bwith\b[\s\S]*$/i, " ");
  m = m.replace(/\bw\/\b[\s\S]*$/i, " ");
  // "… in Gun Locker Hard Case" / "… in Hard Case" / "… Hard Case"
  m = m.replace(/\bin\b.+?\b(?:hard\s+)?case\b[\s\S]*$/i, " ");
  m = m.replace(/\bhard(?:[- ]?duty)?\s+case\b[\s\S]*$/i, " ");
  m = m.replace(/\bin\s+(?:factory\s+)?(?:bag|box)\b[\s\S]*$/i, " ");
  m = m.replace(/,\s*\(\d+\).*$/i, " ");
  m = m.replace(/\b(?:engraved|turkish\s+walnut|hand[- ]?carved|hard[- ]?carved)\b[\s\S]*$/i, " ");
  m = m.replace(/\s*\/\s*\.?45\s*L?C\b/gi, " ");
  m = m.replace(/^\s*Firearms\s+/i, "");
  m = m.replace(/\bFirearms\b/gi, " ");
  // Auction action / transfer noise that sometimes survives parse
  m = m.replace(/\bTRANS\b[\s:,#-]*[\d]+(?:\s*[,/]\s*[\d]+)*/gi, " ");
  m = m.replace(/\b(?:semi-?automatic|semi-?auto|semi|bolt(?:\s*action)?|lever(?:\s*action)?|pump(?:\s*action)?)\b/gi, " ");
  // Glued auction calibers left in the model field (308CAL, 7.62X39CAL)
  m = m.replace(/\b\d+\.\d+\s*[xX]\s*\d+\s*CAL\b/gi, " ");
  m = m.replace(/\b\d{2,3}CAL\b/gi, " ");
  m = m.replace(/\b10\s*-\s*22\b/gi, "10/22");
  // Trailing caliber glued into model (Desk already has a caliber field).
  // A hyphenated model such as 1911-22 must stay intact — the 22 is the variant,
  // not a separate ".22" cartridge stuck on the end.
  m = m.replace(
    /(?:^|[\s,])(?:9\s*x\s*19(?:mm)?|9\s*mm(?:\s*luger)?|10\s*mm|\.?(?:22|25|32|38|357|380|40|44|45)\s*(?:lr|acp|auto|special|spl|mag(?:num)?|wmr|s\s*&\s*w|colt)?|12\s*ga(?:uge)?|20\s*ga(?:uge)?)\s*$/i,
    " ",
  );
  m = m.replace(/[*#|]+/g, " ").replace(/\s{2,}/g, " ").trim();
  // Drop orphan punctuation left after strips
  m = m.replace(/(?:^|\s)[-–—./]+(?=\s|$)/g, " ").replace(/\s{2,}/g, " ").trim();
  return m;
}

/** Progressive shorter model variants for OA retry (cleaned → core → first code token). */
export function modelQueryVariants(model: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(t);
  };

  push(model);
  const cleaned = cleanModelForOa(model);
  push(cleaned);

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length > 3) push(tokens.slice(0, 3).join(" "));
  if (tokens.length > 2) push(tokens.slice(0, 2).join(" "));

  // First token that looks like a model code (P365, DR920, G3C, 1911, RS22P)
  const code = tokens.find((t) => /[a-z].*\d|\d.*[a-z]|\d{3,}/i.test(t));
  if (code) push(code);

  // Sig style: keep family before dash variant (P365-9-BXR3 → P365)
  const dashBase = cleaned.match(/^([A-Za-z]{1,4}\d{2,4})(?:[-_\s]|$)/);
  if (dashBase?.[1]) push(dashBase[1]);

  // Rock Island / 1911 lines: M1911 A1 FS → M1911, 1911
  if (/\bm?1911\b/i.test(cleaned)) {
    push("M1911");
    push("1911");
  }

  // Taurus "Circuit Judge" auction lines → OA "Judge"; Rossi keeps Circuit Judge
  if (/\bcircuit\s+judge\b/i.test(cleaned)) {
    push("Circuit Judge");
    push("Judge");
  }

  // Ruger American family: bare AMERICAN often needs AMERICAN RIFLE in OA
  if (/^american$/i.test(cleaned)) {
    push("American Rifle");
    push("American");
  }

  // Baby Browning / Nomad lines
  if (/baby\s+browning/i.test(cleaned)) {
    push("Baby Browning");
    push("1906");
  }
  if (/^nomad$/i.test(cleaned)) push("Nomad");

  // Springfield XD family
  if (/\bxd\s*9\b/i.test(cleaned) || /^xd9$/i.test(cleaned)) {
    push("XD9");
    push("XD 9");
    push("XD Service");
    push("XD");
  }
  if (/\bxd\s*45\b/i.test(cleaned) || /^xd45$/i.test(cleaned)) {
    push("XD45");
    push("XD 45");
    push("XD Service");
    push("XD");
  }
  if (/\bhellcat\b/i.test(cleaned)) push("Hellcat");
  if (/\bprodigy|prodgy\b/i.test(cleaned)) push("Prodigy");

  // Savage 93R17 family
  if (/93\s*r\s*17/i.test(cleaned)) {
    push("93R17");
    push("93R17 F");
    push("93R17 FV");
  }

  // Remington 887 Nitro Mag
  if (/887|nitromag/i.test(cleaned)) {
    push("887");
  }

  return out;
}

/**
 * Split glued model codes (SD9VE, M&P9) into searchable tokens.
 * OA catalog titles often insert spaces: "S&W SD9 VE".
 */
export function explodeCompactModel(model: string): string[] {
  const m = model.toLowerCase().trim();
  if (!m) return [];
  const out = new Set<string>([m]);
  const spaced = m
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/[-_/]+/g, " ");
  for (const t of spaced.split(/\s+/)) {
    const p = t.trim();
    if (p.length >= 2) out.add(p);
  }
  return Array.from(out);
}

/** Search tokens used to score candidate model names. */
export function modelSearchTokens(query: GbaQuery): string[] {
  const tokens: string[] = [];
  const romans = new Set(["ii", "iv", "v"]);

  for (const value of [
    query.model,
    query.variant,
    compactMpModel(query.model ?? ""),
    cleanModelForOa(query.model ?? ""),
  ]) {
    for (const part of explodeCompactModel(value ?? "")) {
      const p = part.trim();
      if (p.length >= 2 || romans.has(p)) tokens.push(p);
    }
    for (const part of (value ?? "").toLowerCase().split(/\s+/)) {
      const p = part.trim();
      if (p.length >= 2 || romans.has(p)) tokens.push(p);
    }
  }

  for (const alias of buildModelAliases(query)) {
    for (const part of alias.toLowerCase().split(/\s+/)) {
      if (part.length >= 2) tokens.push(part);
    }
  }

  const mdl = (query.model ?? "").toLowerCase().trim();
  const mfr = (query.manufacturer ?? "").toLowerCase().trim();
  if (mfr && mdl) tokens.push(`${mfr} ${mdl}`, `${mfr.split(/\s+/)[0]} ${mdl}`);
  if (/^\d+$/.test(mdl)) {
    tokens.push(mdl);
    tokens.push(`g${mdl}`);
  }

  const variant = (query.variant ?? "").toLowerCase();
  if (variant.includes("gen") && variant.includes("5")) tokens.push("gen5", "gen", "5");
  if (variant.includes("gen") && variant.includes("4")) tokens.push("gen4", "gen", "4");

  return Array.from(new Set(tokens.filter(Boolean)));
}

/* ------------------------------------------------------------------ *
 * Component scorers
 * ------------------------------------------------------------------ */

function scoreCaliber(caliberName: string | null | undefined, query: GbaQuery): number {
  const wanted = (query.caliber ?? "").trim();
  if (!wanted) return 50;
  if (!caliberName) return 10;
  const title = caliberName.toLowerCase();
  const forms = buildCaliberTokens(wanted);
  if (forms.some((f) => caliberInTitle(f, title))) return 100;
  // Last resort: short calibers only allow a single edit (e.g. "9mm" vs "9mn").
  const qn = norm(wanted);
  const cn = norm(caliberName);
  if (qn.length >= 4 && isNearMiss(qn, cn)) return 55;
  return 0;
}

function scoreManufacturer(mfrName: string, query: GbaQuery): number {
  const q = norm(query.manufacturer);
  const n = norm(mfrName);
  if (!q) return 0;
  if (q === n) return 100;
  if (q.length >= 3 && (n.includes(q) || q.includes(n))) return 100;
  const qTokens = (query.manufacturer ?? "").toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const lowerName = mfrName.toLowerCase();
  if (qTokens.length > 0 && qTokens.every((t) => lowerName.includes(t))) return 80;
  // Typo pass: "Rugr" → "Ruger". Tiny stubs (len < 3) never invent a brand.
  if (isNearMiss(q, n)) return 70;
  return 0;
}

/**
 * Score a catalog model name against desk tokens, with a typo fallback on the
 * normalized model string when token scoring finds nothing.
 */
function scoreModelName(modelName: string, tokens: string[], queryModel?: string): number {
  if (tokens.length === 0 && !(queryModel ?? "").trim()) return 0;
  const name = modelName.toLowerCase();
  const normName = norm(name);
  const qModel = queryModel ?? "";
  if (qModel.trim() && !familyTokensCompatible(qModel, modelName)) return 0;
  if (qModel.trim() && hasUnmatchedPremiumVariant(qModel, modelName)) return 0;
  if (qModel.trim() && missingQuerySizeToken(qModel, modelName)) return 0;
  const qn = norm(cleanModelForOa(qModel) || qModel);
  if (qn.length >= 2 && normName === qn) return 100;

  // M&P45 catalog vs desk tokens "m&p" + "45" or compact "m&p45"
  if (normName.includes("mp") && /\bm&p\b/i.test(name + " " + tokens.join(" "))) {
    const mpNum = tokens.find((t) => /^\d{1,3}$/.test(t));
    if (mpNum && (normName.includes(`mp${mpNum}`) || normName === `mp${mpNum}`)) return 92;
  }

  // 88 for the primary model number only (29-10 → 29, not 10).
  // When both "1911" and "1911-22" clear this, preferCatalogLeaf keeps the
  // hyphenated leaf and, on a close score, the larger sold sample.
  if (tokens.includes("1911") && /\b1911\b/i.test(name)) return 88;

  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      const primary = primaryModelNumber(queryModel);
      if (primary && tok !== primary) continue;
      if (normName.includes(`g${tok}`) || normName.includes(`glock${tok}`)) return 92;
      if (new RegExp(`\\b${escapeRegExp(tok)}\\b`).test(name)) return 88;
    }
    if (tok.startsWith("g") && /^\d+$/.test(tok.slice(1)) && normName.includes(tok)) {
      return 95;
    }
  }

  let matched = 0;
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) continue;
    if (name.includes(tok) || normName.includes(tok.replace(/\s+/g, ""))) matched += 1;
  }
  if (matched > 0) {
    return Math.min(75, (matched / Math.max(1, tokens.length)) * 100);
  }

  // Typo fallback: compare cleaned desk model to catalog (e.g. "SP10l" → "SP101").
  if (qn.length >= 3 && isModelNearMiss(qn, normName)) return 60;
  // Also try each significant token as a near-miss against the full catalog name.
  for (const tok of tokens) {
    const tn = norm(tok);
    if (tn.length >= 3 && isModelNearMiss(tn, normName)) return 58;
  }
  return 0;
}

/** True when the query has a hyphenated variant the catalog name does not contain. */
function hyphenVariantMissing(queryModel: string, catalogName: string): boolean {
  const variants = queryModel.toLowerCase().match(/\b[a-z0-9]+-[a-z0-9]+\b/g) ?? [];
  const name = catalogName.toLowerCase();
  return variants.some((tok) => !name.includes(tok));
}

/* ------------------------------------------------------------------ *
 * Condition mapping
 * ------------------------------------------------------------------ */

/** Condition buckets to search in the dependency tree for this query. */
export function oaConditions(query: GbaQuery): string[] {
  const cond = (query.condition ?? "any").toLowerCase();
  if (cond === "new") return ["NEW"];
  if (cond === "used" || cond === "lnib") return ["USED"];
  return ["NEW", "USED"];
}

function conditionParam(key: string): "New" | "Used" {
  return key === "USED" ? "Used" : "New";
}

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

/**
 * Map desk form fields onto a catalog manufacturer / model / caliber selection.
 * Returns the highest-confidence candidate, or null when nothing clears the gates.
 *
 * Blended weights: manufacturer 25%, model 55%, caliber 20%, with a small bonus
 * for catalog-flagged common manufacturers to break ties.
 */
function leafSoldCount(
  cal: OaCaliberNode,
  key: string,
  soldCounts?: ReadonlyMap<string, number>,
): number {
  const fromMap = soldCounts?.get(key);
  if (fromMap != null && Number.isFinite(fromMap)) return fromMap;
  const raw = cal.SoldCount;
  return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

export function soldCountKey(conditionKey: string, modelId: number, caliberId: number): string {
  return `${conditionKey}|${modelId}|${caliberId}`;
}

function resolveSelectionWithThresholds(
  deps: OaDependencies,
  query: GbaQuery,
  thresholds: { mfr: number; model: number; cal: number },
  soldCounts?: ReadonlyMap<string, number>,
): OaSelection | null {
  const tokens = modelSearchTokens(query);
  const wantCaliber = (query.caliber ?? "").trim().length > 0;
  let best: OaSelection | null = null;

  for (const condKey of oaConditions(query)) {
    const nodes = deps[condKey];
    if (!Array.isArray(nodes)) continue;

    for (const node of nodes) {
      const mfrName = String(node.Manufacturer ?? "");
      const mfrScore = scoreManufacturer(mfrName, query);
      if (mfrScore < thresholds.mfr) continue;

      const mfrId = toInt(node.ManufacturerID);
      const models = node.Models;
      if (!Array.isArray(models)) continue;

      for (const modelNode of models) {
        const modelName = String(modelNode.Model ?? "");
        const modelScore = scoreModelName(modelName, tokens, query.model);
        if (modelScore < thresholds.model) continue;

        const modelId = toInt(modelNode.ModelID);
        const calibers = modelNode.Calibers;
        if (!Array.isArray(calibers) || calibers.length === 0) continue;
        // Bare "700" must not guess .22-250 vs 7mm Rem Mag.
        if (!wantCaliber && calibers.length > 1) continue;

        for (const cal of calibers) {
          const calName = cal.Caliber ?? null;
          const calScore = scoreCaliber(calName != null ? String(calName) : null, query);
          if (wantCaliber && calScore < thresholds.cal) continue;

          const calId = toInt(cal.CaliberID);
          let total = mfrScore * 0.25 + modelScore * 0.55 + calScore * 0.2;
          if (node.IsCommonManufacturer) total += 2;
          const countKey = soldCountKey(condKey, modelId, calId);

          const candidate: OaSelection = {
            conditionKey: condKey,
            conditionParam: conditionParam(condKey),
            manufacturerId: mfrId,
            manufacturer: mfrName,
            modelId,
            model: modelName,
            caliberId: calId,
            caliber: String(calName ?? ""),
            score: total,
            soldCount: leafSoldCount(cal, countKey, soldCounts),
          };
          if (best === null || preferCatalogLeaf(candidate, best, query)) best = candidate;
        }
      }
    }
  }

  return best;
}

/**
 * Prefer `candidate` over `best`.
 * When both scores clear the confidence gate and sit within MATCH_SCORE_TIE_MARGIN,
 * the leaf with more sold comps wins — even if its score is a few points lower.
 * Otherwise a clearly higher score wins, then an exact model, then the shorter name.
 */
export function preferCatalogLeaf(candidate: OaSelection, best: OaSelection, query: GbaQuery): boolean {
  const cN = candidate.soldCount ?? 0;
  const bN = best.soldCount ?? 0;
  const queryModel = query.model ?? "";
  const candHasVariant = !hyphenVariantMissing(queryModel, candidate.model);
  const bestHasVariant = !hyphenVariantMissing(queryModel, best.model);
  if (candHasVariant !== bestHasVariant) return candHasVariant;
  const bothConfident =
    candidate.score >= MIN_MATCH_CONFIDENCE && best.score >= MIN_MATCH_CONFIDENCE;
  if (
    bothConfident &&
    Math.abs(candidate.score - best.score) <= MATCH_SCORE_TIE_MARGIN &&
    cN !== bN
  ) {
    return cN > bN;
  }
  if (candidate.score > best.score + 0.5) return true;
  if (best.score > candidate.score + 0.5) return false;
  const qn = norm(cleanModelForOa(query.model) || query.model);
  const candExact = norm(candidate.model) === qn;
  const bestExact = norm(best.model) === qn;
  if (candExact !== bestExact) return candExact;
  if (cN !== bN) return cN > bN;
  if (candidate.model.length !== best.model.length) return candidate.model.length < best.model.length;
  return candidate.score > best.score;
}

export function isLowConfidenceMatch(score: number | null | undefined): boolean {
  return score != null && Number.isFinite(score) && score < MIN_MATCH_CONFIDENCE;
}

/** Map desk form fields onto OA catalog IDs (strict pass, then relaxed pass). */
export function resolveSelection(
  deps: OaDependencies,
  query: GbaQuery,
  soldCounts?: ReadonlyMap<string, number>,
): OaSelection | null {
  const strict = { mfr: MIN_MANUFACTURER_SCORE, model: MIN_MODEL_SCORE, cal: MIN_CALIBER_SCORE };
  const hit = resolveSelectionWithThresholds(deps, query, strict, soldCounts);
  if (hit && !isAmbiguousManufacturerTypo(deps, query, hit)) return hit;
  const relaxed = resolveSelectionWithThresholds(deps, query, { mfr: 25, model: 35, cal: 30 }, soldCounts);
  if (relaxed && !isAmbiguousManufacturerTypo(deps, query, relaxed)) return relaxed;
  return null;
}

/** Score every attempt and keep the leaf preferCatalogLeaf ranks first. */
export function resolveBestAttempt(
  deps: OaDependencies,
  attempts: GbaQuery[],
  soldCounts?: ReadonlyMap<string, number>,
): OaSelection | null {
  let best: OaSelection | null = null;
  for (const attempt of attempts) {
    const hit = resolveSelection(deps, attempt, soldCounts);
    if (!hit) continue;
    if (best == null || preferCatalogLeaf(hit, best, attempt)) best = hit;
  }
  return best;
}

/**
 * True when the query manufacturer is only a typo-near-miss of 2+ catalog brands
 * that each have a viable model — do not auto-pick in that case.
 */
function isAmbiguousManufacturerTypo(
  deps: OaDependencies,
  query: GbaQuery,
  hit: OaSelection,
): boolean {
  if (scoreManufacturer(hit.manufacturer, query) !== 70) return false;
  const tokens = modelSearchTokens(query);
  const viable = new Set<number>();
  for (const condKey of oaConditions(query)) {
    const nodes = deps[condKey];
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      const mfrName = String(node.Manufacturer ?? "");
      if (scoreManufacturer(mfrName, query) !== 70) continue;
      const mfrId = toInt(node.ManufacturerID);
      const models = node.Models;
      if (!Array.isArray(models)) continue;
      for (const modelNode of models) {
        const modelScore = scoreModelName(String(modelNode.Model ?? ""), tokens, query.model);
        if (modelScore >= MIN_MODEL_SCORE) {
          viable.add(mfrId);
          break;
        }
      }
    }
  }
  return viable.size > 1;
}

/** Lightweight near-miss row for the Evaluate UI when auto-resolve fails. */
export type OaNearMissSuggestion = {
  manufacturer: string;
  model: string;
  caliber: string;
  modelId: number;
  caliberId: number;
  conditionParam: "New" | "Used";
  score: number;
};

/**
 * Top near-miss catalog leaves when resolveSelection returns null.
 * Used so the user can click a suggestion instead of guessing spelling.
 */
export function suggestNearMissSelections(
  deps: OaDependencies,
  query: GbaQuery,
  limit = 5,
): OaNearMissSuggestion[] {
  const tokens = modelSearchTokens(query);
  const wantCaliber = (query.caliber ?? "").trim().length > 0;
  const ranked: OaNearMissSuggestion[] = [];

  for (const condKey of oaConditions(query)) {
    const nodes = deps[condKey];
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      const mfrName = String(node.Manufacturer ?? "");
      const mfrScore = scoreManufacturer(mfrName, query);
      // Soft gate: allow weak manufacturer for suggestions
      if (mfrScore < 25 && !isNearMiss(norm(query.manufacturer), norm(mfrName))) continue;
      const models = node.Models;
      if (!Array.isArray(models)) continue;
      for (const modelNode of models) {
        const modelName = String(modelNode.Model ?? "");
        const modelScore = scoreModelName(modelName, tokens, query.model);
        if (modelScore < 20) continue;
        const calibers = modelNode.Calibers;
        if (!Array.isArray(calibers) || calibers.length === 0) continue;
        for (const cal of calibers) {
          const calName = cal.Caliber != null ? String(cal.Caliber) : "";
          const calScore = scoreCaliber(calName || null, query);
          if (wantCaliber && calScore < 20) continue;
          const total =
            Math.max(mfrScore, 25) * 0.25 + modelScore * 0.55 + Math.max(calScore, 20) * 0.2;
          ranked.push({
            manufacturer: mfrName,
            model: modelName,
            caliber: calName,
            modelId: toInt(modelNode.ModelID),
            caliberId: toInt(cal.CaliberID),
            conditionParam: conditionParam(condKey),
            score: total,
          });
        }
      }
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  const out: OaNearMissSuggestion[] = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const key = `${row.modelId}:${row.caliberId}:${row.conditionParam}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/** Desk shorthand → OA catalog manufacturer spellings. */
const MANUFACTURER_CANONICAL: Record<string, string> = {
  "s&w": "Smith & Wesson",
  sw: "Smith & Wesson",
  "smith and wesson": "Smith & Wesson",
  hk: "Heckler & Koch",
  "heckler and koch": "Heckler & Koch",
  sig: "Sig Sauer",
  "taurus intl": "Taurus",
  "rock island": "Rock Island Armory",
  ria: "Rock Island Armory",
  psa: "Palmetto State Armory",
  palmetto: "Palmetto State Armory",
  cz: "CZ",
  canik: "Canik",
  ruger: "Ruger",
  glock: "Glock",
  mossberg: "Mossberg",
  beretta: "Beretta",
  kimber: "Kimber",
  walther: "Walther",
  stoeger: "Stoeger",
  savage: "Savage Arms",
  "h&r": "H&R 1871",
  "harrington & richardson": "H&R 1871",
  "harrington and richardson": "H&R 1871",
  fnh: "FNH",
  fn: "FNH",
};

/** Alternate desk queries when the first pass does not match the OA catalog (e.g. Savage → Savage Arms). */
export function resolveQueryAttempts(query: GbaQuery): GbaQuery[] {
  const attempts: GbaQuery[] = [];
  const seen = new Set<string>();
  const originalCaliber = (query.caliber ?? "").trim();
  const originalCondition = (query.condition ?? "any").toLowerCase();
  const push = (q: GbaQuery) => {
    // Never silently drop a caliber the desk already has.
    if (originalCaliber && !(q.caliber ?? "").trim()) return;
    // Never fall back from Used solds onto New / any.
    const nextCond = (q.condition ?? "any").toLowerCase();
    if (originalCondition === "used" && nextCond !== "used" && nextCond !== "lnib") return;
    const key = JSON.stringify(q);
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(q);
  };
  push(query);

  if (query.condition !== "any") push({ ...query, condition: "any" });

  const mfr = query.manufacturer.trim();
  const mfrKey = mfr.toLowerCase();
  const canonical = MANUFACTURER_CANONICAL[mfrKey] ?? MANUFACTURER_CANONICAL[norm(mfr)];
  if (canonical && norm(canonical) !== norm(mfr)) {
    push({ ...query, manufacturer: canonical });
    if (query.condition !== "any") push({ ...query, manufacturer: canonical, condition: "any" });
  }

  if (/^savage$/i.test(mfr)) {
    push({ ...query, manufacturer: "Savage Arms" });
    push({ ...query, manufacturer: "Savage Arms", condition: "any" });
  }

  const model = query.model.trim();
  if (!(query.caliber ?? "").trim()) {
    const inferred = inferCaliberFromText(model);
    if (inferred) {
      push({ ...query, caliber: inferred });
      if (query.condition !== "any") push({ ...query, caliber: inferred, condition: "any" });
    }
  }
  for (const variant of modelQueryVariants(model)) {
    if (variant === model) continue;
    push({ ...query, model: variant });
    if (query.condition !== "any") push({ ...query, model: variant, condition: "any" });
    const mp = compactMpModel(variant);
    if (mp !== variant) {
      push({ ...query, model: mp });
      if (query.condition !== "any") push({ ...query, model: mp, condition: "any" });
    }
  }

  const mpCompact = compactMpModel(model);
  if (mpCompact !== model) {
    push({ ...query, model: mpCompact });
    if (query.condition !== "any") push({ ...query, model: mpCompact, condition: "any" });
  }

  if (/[a-z]\d|\d[a-z]/i.test(model)) {
    const spaced = model
      .replace(/([a-z])(\d)/gi, "$1 $2")
      .replace(/(\d)([a-z])/gi, "$1 $2");
    if (spaced !== model) {
      push({ ...query, model: spaced });
      if (query.condition !== "any") push({ ...query, model: spaced, condition: "any" });
    }
  }

  // Manufacturer aliases that often arrive glued into the model line from auction parsers
  if (/^tisas(\s+arms)?$/i.test(mfr)) {
    push({ ...query, manufacturer: "Tisas" });
    push({ ...query, manufacturer: "SDS Imports" });
  }
  if (/^cz$/i.test(mfr)) {
    push({ ...query, manufacturer: "CZ-USA" });
    push({ ...query, manufacturer: "CZ" });
  }
  if (/american tactical/i.test(mfr)) {
    push({ ...query, manufacturer: "ATI" });
    push({ ...query, manufacturer: "American Tactical Imports" });
  }
  if (/^sig(\s*sauer)?$/i.test(mfr)) {
    push({ ...query, manufacturer: "SIG SAUER" });
    push({ ...query, manufacturer: "Sig Sauer" });
  }
  if (/rock island/i.test(mfr)) {
    push({ ...query, manufacturer: "Armscor" });
    push({ ...query, manufacturer: "Rock Island Armory" });
    push({ ...query, manufacturer: "ARMSCOR/RIA" });
  }

  if (/harrington|h\s*&\s*r|^h&r$/i.test(mfr)) {
    push({ ...query, manufacturer: "H&R 1871" });
    push({ ...query, manufacturer: "H&R 1871", condition: "any" });
    push({ ...query, manufacturer: "New England Firearms (NEF)" });
  }

  // FN Baby Browning is under FNH in OA (not Browning)
  if (/baby\s*browning/i.test(model) || (/browning/i.test(mfr) && /baby/i.test(model))) {
    push({ ...query, manufacturer: "FNH", model: "Baby Browning" });
    push({ ...query, manufacturer: "FNH", model: "Baby Browning", condition: "any" });
    push({ ...query, manufacturer: "FNH", model: "Baby Browning", caliber: undefined });
  }

  // Springfield XD9 / XD45 auction shorthand → XD / XD Service family
  if (/^xd\s*9$/i.test(model) || /^xd9$/i.test(model)) {
    for (const variant of ["XD Service", "XD", "XD Compact", "XD Subcompact", "XD Tactical"]) {
      push({ ...query, model: variant });
      push({ ...query, model: variant, caliber: undefined });
    }
  }
  if (/^xd\s*45$/i.test(model) || /^xd45$/i.test(model)) {
    for (const variant of ["XD Service", "XD", "XD Compact", "XD Subcompact", "XD Tactical"]) {
      push({ ...query, model: variant });
      push({ ...query, model: variant, caliber: undefined });
    }
  }

  // Savage 93R17 often lacks the stock letter suffix in auction titles
  if (/^93\s*r\s*17$/i.test(model.replace(/\s+/g, "")) || /^93r17$/i.test(model)) {
    for (const variant of ["93R17 F", "93R17 FV", "93R17 FV-SR", "93R17 FXP", "93 F"]) {
      push({ ...query, model: variant });
      push({ ...query, manufacturer: "Savage", model: variant });
      push({ ...query, manufacturer: "Savage Arms", model: variant });
    }
  }

  // Pearce "BLACK MARK" → Buck Mark; Custom II → 1911 family
  if (/black\s*mark|buck\s*mark/i.test(model)) {
    push({ ...query, model: "Buck Mark" });
    push({ ...query, model: "Buck Mark", caliber: undefined });
  }
  if (/custom\s*ii/i.test(model)) {
    push({ ...query, model: "1911" });
    push({ ...query, model: "1911 Stainless II" });
    push({ ...query, model: "Custom II", caliber: query.caliber || ".45 ACP" });
  }

  // Caliber mismatches often block otherwise-good models — try model-only.
  if ((query.caliber ?? "").trim()) {
    for (const variant of modelQueryVariants(model)) {
      push({ ...query, model: variant, caliber: undefined });
      push({ ...query, model: variant, caliber: undefined, condition: "any" });
    }
  }

  const combo = `${mfr} ${cleanModelForOa(query.model)}`.trim();
  if (combo.length > query.model.length) push({ ...query, model: combo });

  for (const maker of oaMakersForIdentity(mfr, model)) {
    if (maker.toLowerCase() === mfr.toLowerCase()) continue;
    push({ ...query, manufacturer: maker });
  }
  const alias = oaModelAliasFor(mfr, model);
  if (alias && alias.model.toLowerCase() !== model.toLowerCase()) {
    const caliber = (query.caliber ?? "").trim() || alias.caliber || undefined;
    const rewritten: GbaQuery = {
      ...query,
      manufacturer: alias.manufacturer,
      model: alias.model,
      caliber,
    };
    push(rewritten);
  }

  return attempts;
}
