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

const MIN_MANUFACTURER_SCORE = 50;
const MIN_MODEL_SCORE = 50;
const MIN_CALIBER_SCORE = 50;

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
    aliases.push("savage-1911", "savage 1911", "sv1911", "sv1911gss");
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

/** Search tokens used to score candidate model names. */
export function modelSearchTokens(query: GbaQuery): string[] {
  const tokens: string[] = [];
  const romans = new Set(["ii", "iv", "v"]);

  for (const value of [query.model, query.variant]) {
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
export function resolveSelection(deps: OaDependencies, query: GbaQuery): OaSelection | null {
  const tokens = modelSearchTokens(query);
  const wantCaliber = (query.caliber ?? "").trim().length > 0;
  let best: OaSelection | null = null;

  for (const condKey of oaConditions(query)) {
    const nodes = deps[condKey];
    if (!Array.isArray(nodes)) continue;

    for (const node of nodes) {
      const mfrName = String(node.Manufacturer ?? "");
      const mfrScore = scoreManufacturer(mfrName, query);
      if (mfrScore < MIN_MANUFACTURER_SCORE) continue;

      const mfrId = toInt(node.ManufacturerID);
      const models = node.Models;
      if (!Array.isArray(models)) continue;

      for (const modelNode of models) {
        const modelName = String(modelNode.Model ?? "");
        const modelScore = scoreModelName(modelName, tokens);
        if (modelScore < MIN_MODEL_SCORE) continue;

        const modelId = toInt(modelNode.ModelID);
        const calibers = modelNode.Calibers;
        if (!Array.isArray(calibers) || calibers.length === 0) continue;

        for (const cal of calibers) {
          const calName = cal.Caliber ?? null;
          const calScore = scoreCaliber(calName != null ? String(calName) : null, query);
          if (wantCaliber && calScore < MIN_CALIBER_SCORE) continue;

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
