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
}

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
  ["9mm", "9 mm", "9x19", "9 x 19", "9mm luger", "9 luger", "9mm parabellum", "9mm para", "9mmp", "9mm nato"],
  ["380 acp", "380 auto", "380", "9mm short", "9x17", "9mm kurz"],
  ["40 s&w", "40 sw", "40 cal", "40 smith", "40"],
  ["357 sig", "357sig"],
  ["357 magnum", "357 mag", "357"],
  ["38 special", "38 spl", "38 spc", "38 special +p"],
  ["10mm", "10 mm", "10mm auto"],
  ["45 acp", "45 auto", "45acp", "45"],
  ["45 colt", "45 long colt", "45 lc", "45lc"],
  ["44 magnum", "44 mag", "44 rem mag"],
  ["223 rem", "223 remington", "223", "5.56", "5.56x45", "5.56 nato", "556", "5.56mm"],
  ["308 win", "308 winchester", "308", "7.62x51", "7.62 nato", "762x51"],
  ["30-06", "30 06", "3006", "30-06 springfield"],
  ["300 blackout", "300 blk", "300 aac", "300aac", "300  blackout"],
  ["7.62x39", "7.62 x 39", "762x39", "7.62 soviet"],
  ["22 lr", "22lr", "22 long rifle", "22"],
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

  return Array.from(forms).filter((f) => f.length >= 2);
}

/** Whether any normalized caliber form is present in a (lowercased) title. */
function caliberInTitle(form: string, title: string): boolean {
  if (form.length < 2) return false;
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
  // Trailing caliber glued into model (Desk already has a caliber field)
  m = m.replace(
    /\b(?:9\s*x\s*19(?:mm)?|9\s*mm(?:\s*luger)?|10\s*mm|\.?(?:22|25|32|38|357|380|40|44|45)\s*(?:lr|acp|auto|special|spl|mag(?:num)?|wmr|s\s*&\s*w|colt)?|12\s*ga(?:uge)?|20\s*ga(?:uge)?)\s*$/i,
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

function scoreModelName(modelName: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const name = modelName.toLowerCase();
  const normName = norm(name);

  // M&P45 catalog vs desk tokens "m&p" + "45" or compact "m&p45"
  if (normName.includes("mp") && /\bm&p\b/i.test(name + " " + tokens.join(" "))) {
    const mpNum = tokens.find((t) => /^\d{1,3}$/.test(t));
    if (mpNum && (normName.includes(`mp${mpNum}`) || normName === `mp${mpNum}`)) return 92;
  }

  if (tokens.includes("1911") && /\b1911\b/i.test(name)) return 88;

  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
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
  if (matched === 0) return 0;
  return Math.min(75, (matched / Math.max(1, tokens.length)) * 100);
}

function scoreCaliber(caliberName: string | null | undefined, query: GbaQuery): number {
  const wanted = (query.caliber ?? "").trim();
  if (!wanted) return 50;
  if (!caliberName) return 10;
  const title = caliberName.toLowerCase();
  const forms = buildCaliberTokens(wanted);
  if (forms.some((f) => caliberInTitle(f, title))) return 100;
  if (forms.includes("45") && /45|\.45/.test(title)) return 90;
  return 0;
}

function scoreManufacturer(mfrName: string, query: GbaQuery): number {
  const q = norm(query.manufacturer);
  const n = norm(mfrName);
  if (!q) return 0;
  if (q === n || n.includes(q) || q.includes(n)) return 100;
  const qTokens = (query.manufacturer ?? "").toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const lowerName = mfrName.toLowerCase();
  if (qTokens.length > 0 && qTokens.every((t) => lowerName.includes(t))) return 80;
  return 0;
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
function resolveSelectionWithThresholds(
  deps: OaDependencies,
  query: GbaQuery,
  thresholds: { mfr: number; model: number; cal: number },
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
        const modelScore = scoreModelName(modelName, tokens);
        if (modelScore < thresholds.model) continue;

        const modelId = toInt(modelNode.ModelID);
        const calibers = modelNode.Calibers;
        if (!Array.isArray(calibers) || calibers.length === 0) continue;

        for (const cal of calibers) {
          const calName = cal.Caliber ?? null;
          const calScore = scoreCaliber(calName != null ? String(calName) : null, query);
          if (wantCaliber && calScore < thresholds.cal) continue;

          const calId = toInt(cal.CaliberID);
          let total = mfrScore * 0.25 + modelScore * 0.55 + calScore * 0.2;
          if (node.IsCommonManufacturer) total += 2;

          if (best === null || total > best.score) {
            best = {
              conditionKey: condKey,
              conditionParam: conditionParam(condKey),
              manufacturerId: mfrId,
              manufacturer: mfrName,
              modelId,
              model: modelName,
              caliberId: calId,
              caliber: String(calName ?? ""),
              score: total,
            };
          }
        }
      }
    }
  }

  return best;
}

/** Map desk form fields onto OA catalog IDs (strict pass, then relaxed pass). */
export function resolveSelection(deps: OaDependencies, query: GbaQuery): OaSelection | null {
  const strict = { mfr: MIN_MANUFACTURER_SCORE, model: MIN_MODEL_SCORE, cal: MIN_CALIBER_SCORE };
  const hit = resolveSelectionWithThresholds(deps, query, strict);
  if (hit) return hit;
  return resolveSelectionWithThresholds(deps, query, { mfr: 25, model: 35, cal: 30 });
}

/** Desk shorthand → OA catalog manufacturer spellings. */
const MANUFACTURER_CANONICAL: Record<string, string> = {
  "s&w": "Smith & Wesson",
  sw: "Smith & Wesson",
  "smith and wesson": "Smith & Wesson",
  hk: "Heckler & Koch",
  "heckler and koch": "Heckler & Koch",
  sig: "Sig Sauer",
  fnh: "FN",
  "taurus intl": "Taurus",
  "rock island": "Rock Island Armory",
  ria: "Rock Island Armory",
  psa: "Palmetto State Armory",
  "palmetto": "Palmetto State Armory",
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
};

/** Alternate desk queries when the first pass does not match the OA catalog (e.g. Savage → Savage Arms). */
export function resolveQueryAttempts(query: GbaQuery): GbaQuery[] {
  const attempts: GbaQuery[] = [query];
  const seen = new Set<string>();
  const push = (q: GbaQuery) => {
    const key = JSON.stringify(q);
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(q);
  };

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

  return attempts;
}
