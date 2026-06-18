/**
 * Relevance scoring for wholesale catalog rows (pure, no I/O).
 * Stops fuzzy queries from surfacing parts/mags and sub-$100 "false floor" prices.
 */

import { isNonFirearmCatalogLine } from "./comp-filter";

export interface WholesaleQuery {
  manufacturer: string;
  model: string;
  caliber?: string;
  category?: string;
}

export interface WholesaleCatalogRow {
  manufacturer: string;
  model: string;
  description: string | null;
  category: string | null;
  dealerPrice?: number;
}

export const MIN_WHOLESALE_SCORE = 50;
/** Rows at or above this score and passing firearm checks appear in the primary grid. */
export const MIN_FIREARM_DISPLAY_SCORE = 70;

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split model string into significant tokens (handles PDP F-Series, etc.). */
function modelTokens(model: string): string[] {
  return model
    .trim()
    .split(/[\s\-\/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Row advertises a variant (PRO, Full Size, …) that the query did not name. */
export function rowHasVariantNotInQuery(query: WholesaleQuery, row: WholesaleCatalogRow): boolean {
  const hay = combinedText(row);
  const qNorm = norm(query.model);

  const qHay = query.model.toLowerCase();
  if (/\bpro[\s-]?e\b/i.test(hay) && !/\bpro[\s-]?e\b/i.test(qHay)) return true;
  if (/\bpro\b/i.test(hay) && !/\bpro\b/i.test(qHay)) return true;
  if (/\bfull\s*size\b/i.test(hay) && !/\bfull\b/i.test(qNorm)) return true;
  if (/\bcompact\b/i.test(hay) && !/\bcompact\b/i.test(qNorm)) return true;
  if (/\b(sd|tactical|elite|premium|max|lite)\b/i.test(hay) && !/\b(sd|tactical|elite|premium|max|lite)\b/i.test(qNorm)) {
    return true;
  }
  return false;
}

function tokenMatchesHaystack(token: string, hay: string): boolean {
  const t = token.toLowerCase();
  if (!t) return false;
  if (t.length === 1 && /[a-z]/i.test(t)) {
    return new RegExp(`\\b${escapeRegExp(t)}\\b|[-/]${escapeRegExp(t)}\\b|\\b${escapeRegExp(t)}[-/]`, "i").test(
      hay,
    );
  }
  if (t.length >= 2) {
    return new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(hay);
  }
  return false;
}

function combinedText(row: WholesaleCatalogRow): string {
  return `${row.manufacturer} ${row.model} ${row.description ?? ""}`.toLowerCase();
}

function manufacturerMatches(row: WholesaleCatalogRow, query: WholesaleQuery): boolean {
  const q = norm(query.manufacturer);
  if (!q) return false;
  const m = norm(row.manufacturer);
  return m.includes(q) || q.includes(m) || combinedText(row).includes(query.manufacturer.toLowerCase());
}

/** Minimum dealer price for a serialized firearm by desk category hint. */
export function minFirearmPriceFloor(category?: string): number {
  const c = (category ?? "").toLowerCase();
  if (c.includes("rifle") || c.includes("shotgun")) return 120;
  if (c.includes("handgun") || c.includes("pistol") || c.includes("revolver")) return 100;
  return 100;
}

export function failsPriceFloor(row: WholesaleCatalogRow, query: WholesaleQuery): boolean {
  const price = row.dealerPrice;
  if (price == null || !Number.isFinite(price)) return false;
  return price < minFirearmPriceFloor(query.category);
}

/** Parts, mags, and components — not complete guns for arbitrage cross-ref. */
export function isAccessoryOrPart(row: WholesaleCatalogRow): boolean {
  return isNonFirearmCatalogLine({
    model: row.model,
    description: row.description,
    category: row.category,
  });
}

/** Likely a complete firearm (pistol/rifle/shotgun), not a component line. */
export function isLikelyFirearm(row: WholesaleCatalogRow, query?: WholesaleQuery): boolean {
  if (isAccessoryOrPart(row)) return false;
  if (query && failsPriceFloor(row, query)) return false;

  const blob = `${row.category ?? ""} ${row.description ?? ""} ${row.model}`.toLowerCase();
  if (/\b(pistol|handgun|revolver|rifle|shotgun|carbine|firearm)\b/.test(blob)) return true;
  if (/\b(autoloading rifle|autoloading|carbine|sporter|takedown)\b/.test(blob)) return true;
  if (/\bpst\b/.test(blob)) return true;
  if (
    /\b(9mm|45acp|40sw|22lr|22 lr|223|556|308|12ga|20ga|10\/22)\b/.test(blob) &&
    !/\b(mag|barrel only|receiver|pin|adapter|scope base)\b/.test(blob)
  ) {
    return true;
  }
  return false;
}

/**
 * Model token match with word boundaries — "19" must not match inside SKU "33193".
 */
export function modelMatchesQuery(row: WholesaleCatalogRow, query: WholesaleQuery): boolean {
  const mdl = query.model.trim().toLowerCase();
  if (!mdl) return false;

  const hay = combinedText(row);
  if (rowHasVariantNotInQuery(query, row)) return false;

  if (/10\s*\/\s*22|10-22|1022/.test(mdl) || norm(mdl) === "1022") {
    if (!/\b10[/\s-]?22\b/.test(hay)) return false;
    if (/\b(scope base|adapter|rail|receiver|trigger|magazine|\bmag\b|pin)\b/.test(hay)) return false;
    return true;
  }

  const tokens = modelTokens(query.model);
  if (tokens.length >= 2 || (tokens.length === 1 && tokens[0]!.length <= 6)) {
    return tokens.every((tok) => tokenMatchesHaystack(tok, hay));
  }

  if (/[a-z]/i.test(mdl)) {
    const re = new RegExp(`\\b${escapeRegExp(mdl)}\\b`, "i");
    if (re.test(hay)) return true;
    if (mdl.length >= 7 && norm(hay).includes(norm(mdl))) return true;
    return false;
  }

  if (/^\d{1,4}$/.test(mdl)) {
    const glockFamily = norm(query.manufacturer).includes("glock") || /\bglock\b|\bglk\b/.test(hay);
    if (glockFamily) {
      if (new RegExp(`\\bg0?${escapeRegExp(mdl)}\\b`, "i").test(hay)) return true;
      if (new RegExp(`\\b${escapeRegExp(mdl)}\\s*(gen|g[3-5]|v|x|mos|fs)\\b`, "i").test(hay)) return true;
      if (new RegExp(`\\bglk\\s*0?${escapeRegExp(mdl)}\\b`, "i").test(hay)) return true;
      if (/\bpst\b/.test(hay) && new RegExp(`\\b0?${escapeRegExp(mdl)}\\b`).test(hay)) return true;
      return false;
    }
    const re = new RegExp(`(^|[^0-9])${escapeRegExp(mdl)}([^0-9]|$)`);
    return re.test(hay);
  }

  return norm(hay).includes(norm(mdl));
}

/** Score in [0, 100+]. Rows below MIN_WHOLESALE_SCORE are dropped. */
export function scoreWholesaleRow(row: WholesaleCatalogRow, query: WholesaleQuery): number {
  if (!manufacturerMatches(row, query)) return 0;
  if (!modelMatchesQuery(row, query)) return 0;
  if (failsPriceFloor(row, query)) return 0;

  let score = 55;

  if (isLikelyFirearm(row, query)) score += 35;
  if (isAccessoryOrPart(row)) score -= 100;

  const mdlNorm = norm(query.model);
  const modelNorm = norm(row.model);
  if (modelNorm === mdlNorm || modelNorm.includes(mdlNorm)) score += 15;

  const desc = (row.description ?? "").toLowerCase();
  if (query.caliber?.trim()) {
    const cal = query.caliber.trim().toLowerCase();
    if (desc.includes(cal) || norm(desc).includes(norm(cal))) score += 10;
  }

  const catHint = (query.category ?? "").toLowerCase();
  if (catHint.includes("handgun") && /\b(pistol|handgun)\b/.test(desc)) score += 10;
  if (catHint.includes("rifle") && /\b(rifle|carbine)\b/.test(desc)) score += 10;

  return score;
}

export function isDisplayFirearm(row: WholesaleCatalogRow, query: WholesaleQuery): boolean {
  const score = scoreWholesaleRow(row, query);
  return score >= MIN_FIREARM_DISPLAY_SCORE && isLikelyFirearm(row, query);
}

/** UPC hit — identity is the barcode; do not re-filter on loose model text (e.g. PDP F vs PRO E). */
export function isUpcCatalogFirearm(row: WholesaleCatalogRow, query?: WholesaleQuery): boolean {
  if (isAccessoryOrPart(row)) return false;
  if (query && failsPriceFloor(row, query)) return false;
  return isLikelyFirearm(row, query);
}

/** Prefer description when model is a bare distributor SKU. */
export interface WholesalePriceMatch {
  dealerPrice: number;
}

/** Drop text matches far below your dealer price — usually a different SKU. */
export function filterTextMatchesByPrice<T extends WholesalePriceMatch>(
  matches: T[],
  yourCost: number,
): { matches: T[]; warning: string | null } {
  if (yourCost <= 0 || matches.length === 0) return { matches, warning: null };
  const lo = yourCost * 0.85;
  const hi = yourCost * 1.15;
  const inBand = matches.filter((m) => m.dealerPrice >= lo && m.dealerPrice <= hi);
  if (inBand.length > 0) return { matches: inBand, warning: null };

  const cheapest = Math.min(...matches.map((m) => m.dealerPrice));
  if (cheapest < lo) {
    return {
      matches: [],
      warning:
        "Catalog matches are much cheaper than your price — likely a different model. Paste the UPC for an exact match.",
    };
  }
  return { matches, warning: null };
}

export function displayProductLabel(row: WholesaleCatalogRow): string {
  const model = row.model?.trim() ?? "";
  if (/^\d{4,}$/.test(model) || (model.length <= 8 && /^\d+[a-z]?$/i.test(model))) {
    return row.description?.trim() || model;
  }
  if (model.length < 4 && row.description) return row.description.trim();
  return model || row.description?.trim() || "—";
}
