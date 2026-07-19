/** Map desk make/model/category → TGV URL path (with alias + candidate retries). */

import type { TgvCategory } from "./parse";

const TGV_ORIGIN = "https://truegunvalue.com";

const CATEGORY_SEGMENT: Record<TgvCategory, string> = {
  handgun: "pistol",
  rifle: "rifle",
  shotgun: "shotgun",
};

/** Canonical TGV brand spellings (desk aliases → TGV-friendly names). */
const BRAND_ALIASES: Array<{ match: RegExp; to: string }> = [
  { match: /^(s\s*&\s*w|s\s*and\s*w|smith\s*&?\s*wesson|smith\s+and\s+wesson)$/i, to: "Smith and Wesson" },
  { match: /^(sig(\s*sauer)?|sigarms)$/i, to: "Sig Sauer" },
  { match: /^(henry(\s+repeating)?(\s+arms)?)$/i, to: "Henry" },
  { match: /^(winchester(\s+repeating)?(\s+arms)?)$/i, to: "Winchester" },
  { match: /^(springfield(\s+armory)?)$/i, to: "Springfield Armory" },
  { match: /^(heritage(\s+manufacturing)?(\s+inc\.?)?)$/i, to: "Heritage" },
  { match: /^(hi[\s-]?point(\s+firearms)?)$/i, to: "Hi-Point" },
  { match: /^(cz([\s-]?usa)?)$/i, to: "CZ" },
  { match: /^(savage(\s+arms)?)$/i, to: "Savage Arms" },
  { match: /^(volquartsen(\s+firearms)?)$/i, to: "Volquartsen" },
  { match: /^(proof(\s+research)?)$/i, to: "Proof Research" },
  { match: /^(fierce(\s+firearms)?)$/i, to: "Fierce" },
  { match: /^(christensen(\s+arms)?)$/i, to: "Christensen Arms" },
  { match: /^(shadow\s+systems)$/i, to: "Shadow Systems" },
  { match: /^(rock\s+island(\s+armory)?)$/i, to: "Rock Island Armory" },
];

/** Model-line aliases when TGV uses a fuller family name. */
const MODEL_ALIASES: Array<{ mfr: RegExp; match: RegExp; to: string }> = [
  { mfr: /^bergara$/i, match: /^wilderness\s+ridge$/i, to: "Wilderness Ridge" },
  { mfr: /^bergara$/i, match: /^(b-?14\s+)?ridge$/i, to: "B-14 Ridge" },
  { mfr: /^bergara$/i, match: /^(b-?14\s+)?timber$/i, to: "B-14 Timber" },
  { mfr: /^christensen/i, match: /^traverse$/i, to: "Traverse" },
  { mfr: /^christensen/i, match: /^mesa(\s+long\s+range)?$/i, to: "Mesa Long Range" },
  { mfr: /^cva$/i, match: /^cascade(\s+(xt|long\s+range\s+hunter))?$/i, to: "Cascade" },
  { mfr: /^smith/i, match: /^(model\s+)?1854(\s+lever)?$/i, to: "Model 1854" },
  { mfr: /^henry$/i, match: /^henry\s+singleshot$/i, to: "Single Shot" },
  { mfr: /^henry$/i, match: /^singleshot$/i, to: "Single Shot" },
  { mfr: /^winchester$/i, match: /^super\s*x4$/i, to: "SX4" },
  { mfr: /^winchester$/i, match: /^super\s*xp$/i, to: "Super X Pump" },
];

/** Rifle-primary OEMs (almost never pistols on TGV). Multi-category OEMs use model cues only. */
const LONG_GUN_MAKERS =
  /\b(bergara|christensen|weatherby|cva|proof\s*research|fierce|tikka|sako|howa|marlin|henry|traditions)\b/i;

const RIFLE_MODEL_CUE =
  /\b(ridge|timber|traverse|cascade|axis|mark\s*ii|mark\s*v|x-?bolt|1854|r92|mesa|elevation|outfitter|singleshot|single\s*shot|scout|patriot|t3x|307|m400|sigm400|zion|hp-?15|m&p15|mp15|fpc|lever)\b/i;

const SHOTGUN_MODEL_CUE =
  /\b(super\s*x4|sx4|silver\s*pigeon|686|a400|sbe|maxus|citori|bps|590|870|1100|1187|super\s*x\s*pump|sxp)\b/i;

export type TgvPathCandidate = {
  manufacturer: string;
  model: string;
  category: TgvCategory;
  path: string;
};

function titleSlugToken(t: string): string {
  if (!t) return t;
  if (/^[A-Z0-9]{2,5}$/.test(t) && /[0-9]/.test(t)) {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** "Sig Sauer" + "P320" → "Sig-Sauer-P320" */
export function tgvSlug(manufacturer: string, model: string): string {
  const raw = `${manufacturer.trim()} ${model.trim()}`
    .replace(/&/g, " ")
    .replace(/[/\\]+/g, " ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return raw
    .split("-")
    .filter(Boolean)
    .map(titleSlugToken)
    .join("-");
}

export function tgvModelPath(
  manufacturer: string,
  model: string,
  category: TgvCategory = "handgun",
): string {
  const seg = CATEGORY_SEGMENT[category] ?? "pistol";
  return `/${seg}/${tgvSlug(manufacturer, model)}/price-historical-value`;
}

export function tgvModelUrl(
  manufacturer: string,
  model: string,
  category: TgvCategory = "handgun",
): string {
  return `${TGV_ORIGIN}${tgvModelPath(manufacturer, model, category)}`;
}

export function normalizeBrandModelKey(manufacturer: string, model: string): string {
  return `${manufacturer}||${model}`
    .toUpperCase()
    .replace(/[^A-Z0-9|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip Inc/LLC and apply brand aliases for TGV URLs. */
export function canonicalizeTgvManufacturer(raw: string): string {
  let m = raw.trim().replace(/\s+/g, " ");
  m = m.replace(/\s+(inc\.?|llc\.?|ltd\.?|co\.?)$/i, "").trim();
  for (const a of BRAND_ALIASES) {
    if (a.match.test(m)) return a.to;
  }
  const stripped = m.replace(/\s+(firearms|arms)$/i, "").trim();
  if (stripped && stripped !== m) {
    for (const a of BRAND_ALIASES) {
      if (a.match.test(stripped)) return a.to;
    }
  }
  return m;
}

/**
 * OA sometimes pipes variants: "1911|1991|Government".
 * Prefer the last non-empty segment (usually the leaf display name).
 */
export function preferModelVariant(raw: string): string {
  const parts = raw
    .split("|")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length <= 1) return raw.replace(/\s+/g, " ").trim();
  return parts[parts.length - 1]!;
}

export function applyModelAlias(manufacturer: string, model: string): string {
  const mfr = manufacturer.trim();
  const mod = model.trim();
  for (const a of MODEL_ALIASES) {
    if (a.mfr.test(mfr) && a.match.test(mod)) return a.to;
  }
  return mod;
}

/** Prefer rifle/shotgun when model+maker cues say so (fixes handgun mis-bucket). */
export function preferTgvCategory(
  manufacturer: string,
  model: string,
  preferred: TgvCategory = "handgun",
): TgvCategory {
  const blob = `${manufacturer} ${model}`;
  if (SHOTGUN_MODEL_CUE.test(blob)) return "shotgun";
  if (RIFLE_MODEL_CUE.test(blob) || LONG_GUN_MAKERS.test(manufacturer)) {
    if (preferred === "shotgun") return "shotgun";
    return "rifle";
  }
  return preferred;
}

function pushUnique(out: TgvPathCandidate[], c: TgvPathCandidate): void {
  if (out.some((x) => x.path === c.path)) return;
  out.push(c);
}

/**
 * Ordered URL candidates for a desk identity.
 * Tries brand/model aliases and alternate category segments when TGV 404s.
 */
export function tgvPathCandidates(
  manufacturer: string,
  model: string,
  preferredCategory: TgvCategory = "handgun",
): TgvPathCandidate[] {
  const rawMfr = manufacturer.trim();
  const rawModel = preferModelVariant(model);
  const canonMfr = canonicalizeTgvManufacturer(rawMfr);
  const aliasedModel = applyModelAlias(canonMfr, rawModel);
  const cat0 = preferTgvCategory(canonMfr, aliasedModel, preferredCategory);

  const mfrVariants = [canonMfr, rawMfr].filter((v, i, a) => v && a.indexOf(v) === i);
  const modelVariants = [aliasedModel, rawModel, preferModelVariant(model)]
    .map((m) => m.trim())
    .filter((v, i, a) => v && a.indexOf(v) === i);

  const cleanedModels: string[] = [];
  for (const m of modelVariants) {
    cleanedModels.push(m);
    const mfrFirst = canonMfr.split(/\s+/)[0] ?? "";
    if (mfrFirst && new RegExp(`^${mfrFirst}\\s+`, "i").test(m)) {
      cleanedModels.push(m.replace(new RegExp(`^${mfrFirst}\\s+`, "i"), "").trim());
    }
  }
  const models = cleanedModels.filter((v, i, a) => v && a.indexOf(v) === i);

  const cats: TgvCategory[] = [cat0];
  for (const c of ["rifle", "shotgun", "handgun"] as TgvCategory[]) {
    if (!cats.includes(c)) cats.push(c);
  }

  const out: TgvPathCandidate[] = [];
  for (const category of cats) {
    for (const mfr of mfrVariants) {
      for (const mod of models) {
        pushUnique(out, {
          manufacturer: mfr,
          model: mod,
          category,
          path: tgvModelPath(mfr, mod, category),
        });
      }
    }
  }
  return out;
}

export { TGV_ORIGIN };
