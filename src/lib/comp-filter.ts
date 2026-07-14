/**
 * Market comp hygiene: drop non-firearm listings, outlier prices, then build decision stats.
 * Pure functions — safe to unit test without API calls.
 */

import { percentile, summarize } from "@/lib/arbitrage/stats";
import type { PriceStats } from "@/lib/arbitrage/types";
import {
  filterAskingByIdentity,
  filterSoldByIdentity,
  matchTierLabel,
  type CompIdentityContext,
  type CompMatchTier,
} from "@/lib/comp-identity";

export type { CompIdentityContext, CompMatchTier } from "@/lib/comp-identity";
export { matchTierLabel } from "@/lib/comp-identity";

/** Minimal sold row shape (matches GbaApiClient SoldCompRow). */
export interface SoldCompInput {
  price: number;
  salesDate: string;
  listingType: string;
  title?: string;
}

/** Minimal asking row shape (matches GbaApiClient AskingCompRow). */
export interface AskingCompInput {
  price: number;
  title: string;
  condition: string;
  location: string;
  itemId: string | null;
}

export interface CompFilterMeta {
  soldRawCount: number;
  soldDecisionCount: number;
  soldOutliersRemoved: number;
  soldNonFirearmRemoved: number;
  askingRawCount: number;
  askingDecisionCount: number;
  askingIncompleteRemoved: number;
  identityRemovedSold: number;
  identityRemovedAsking: number;
  matchTier: CompMatchTier;
  enrichNotes: string[];
  decisionNote: string;
}

export interface BuildDecisionStatsOptions {
  category?: string;
  identity?: CompIdentityContext;
  enrichNotes?: string[];
}

/** Minimum sold/asking price for a complete gun by desk category hint. */
export function minCompPriceFloor(category?: string): number {
  const c = (category ?? "").toLowerCase();
  if (c.includes("rifle") || c.includes("shotgun")) return 120;
  if (c.includes("handgun") || c.includes("pistol") || c.includes("revolver")) return 100;
  return 75;
}

const PENNY_OR_JUNK = /\bpenny\b|^\$?0\.0?1\b/i;

/** Title/description signals for parts, mags, optics, receivers — not complete firearms. */
const NON_FIREARM_TITLE =
  /\b(receiver|receivers|stripped|barrel only|barrel\s*only|slide only|upper only|lower only|parts? kit|part kit|firing pin|pin safety|scope base|mount adapter|adapter rail|weaver|picatinny rail|\bmag\b|magazines?|holster|grip module|bx-?trigger|trigger kit|conversion kit|stock kit|chassis only|optics?|reflex sight|red dot|mount only|ammo|ammunition|cleaning kit|tool kit|extractor|disconnector|recoil spring|guide rod|mag release|extended mag)\b/i;

const NON_FIREARM_CATEGORY =
  /\b(parts?|accessories|magazine|magazines|optics?|ammo|ammunition|holster|apparel|cleaning|mounts?)\b/i;

export function isNonFirearmCompTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t || t.length < 4) return true;
  if (PENNY_OR_JUNK.test(t)) return true;
  if (NON_FIREARM_TITLE.test(t)) return true;
  return false;
}

export function isCompleteFirearmCompTitle(title: string): boolean {
  return !isNonFirearmCompTitle(title);
}

/** Drop statistical outliers and extreme collector/lot prices before FMV percentiles. */
export function filterOutlierPrices(prices: number[]): { filtered: number[]; removed: number } {
  const clean = prices.filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length < 8) return { filtered: clean, removed: 0 };

  const sorted = [...clean].sort((a, b) => a - b);
  const p25 = percentile(sorted, 25);
  const p75 = percentile(sorted, 75);
  const med = percentile(sorted, 50);
  const iqr = Math.max(p75 - p25, med * 0.05);
  const lo = Math.max(1, p25 - 1.5 * iqr);
  const hi = p75 + 1.5 * iqr;
  const capHigh = med * 2.5;
  const floorLow = med * 0.12;

  const filtered = sorted.filter((p) => p >= lo && p <= hi && p >= floorLow && p <= capHigh);
  return { filtered, removed: clean.length - filtered.length };
}

function parseSalesDate(raw: string): number {
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export function isNonFirearmSoldRow(row: SoldCompInput, category?: string): boolean {
  if (row.price < minCompPriceFloor(category)) return true;
  if (row.title?.trim() && isNonFirearmCompTitle(row.title)) return true;
  const type = row.listingType.toLowerCase();
  if (/\b(parts?|accessory|magazine|ammo)\b/.test(type)) return true;
  return false;
}

export function filterSoldCompRows(
  rows: SoldCompInput[],
  category?: string,
): { rows: SoldCompInput[]; removed: number } {
  const kept = rows.filter((r) => !isNonFirearmSoldRow(r, category));
  return { rows: kept, removed: rows.length - kept.length };
}

/**
 * Representative sold sample: within the decision IQR band, most recent first.
 * Only includes rows that pass firearm checks when a title is present.
 */
export function selectSoldRowsForDisplay(
  rows: SoldCompInput[],
  stats: PriceStats,
  category?: string,
): SoldCompInput[] {
  if (!rows.length || stats.count === 0) return [];
  const guns = rows.filter((r) => !isNonFirearmSoldRow(r, category));
  if (!guns.length) return [];
  const lo = stats.p25 * 0.9;
  const hi = Math.max(stats.p75 * 1.12, stats.median * 1.25);
  const band = guns.filter((r) => r.price >= lo && r.price <= hi);
  const pool = band.length >= 8 ? band : guns.filter((r) => r.price <= hi * 1.05);
  return [...pool].sort((a, b) => parseSalesDate(b.salesDate) - parseSalesDate(a.salesDate)).slice(0, 25);
}

/** Incomplete listings that pollute asking medians. */
export function isIncompleteAskingListing(row: AskingCompInput, category?: string): boolean {
  if (row.price < minCompPriceFloor(category)) return true;
  const title = row.title.toLowerCase();
  if (!title || title.length < 4) return true;
  if (isNonFirearmCompTitle(row.title)) return true;
  return false;
}

export function filterAskingRows(
  rows: AskingCompInput[],
  category?: string,
): { rows: AskingCompInput[]; removed: number } {
  const kept = rows.filter((r) => !isIncompleteAskingListing(r, category));
  return { rows: kept, removed: rows.length - kept.length };
}

function resolveBuildOptions(options?: string | BuildDecisionStatsOptions): BuildDecisionStatsOptions {
  if (typeof options === "string") return { category: options };
  return options ?? {};
}

export function buildDecisionStats(
  soldPrices: number[],
  askingPrices: number[],
  soldRows: SoldCompInput[],
  askingRows: AskingCompInput[],
  options?: string | BuildDecisionStatsOptions,
): {
  sold: PriceStats;
  asking: PriceStats;
  soldDisplay: SoldCompInput[];
  askingDisplay: AskingCompInput[];
  meta: CompFilterMeta;
} {
  const { category, identity, enrichNotes = [] } = resolveBuildOptions(options);

  const soldGunFilter = filterSoldCompRows(soldRows, category);
  const soldIdentity = identity
    ? filterSoldByIdentity(soldGunFilter.rows, identity)
    : { rows: soldGunFilter.rows, removed: 0, tier: "family" as const };
  const soldPricesFromRows = soldIdentity.rows.map((r) => r.price);
  const soldFilter = filterOutlierPrices(soldPricesFromRows.length ? soldPricesFromRows : soldPrices);
  const sold = summarize(soldFilter.filtered);
  const soldDisplay = selectSoldRowsForDisplay(soldIdentity.rows, sold, category);

  const askingFiltered = filterAskingRows(askingRows, category);
  const askingIdentity = identity
    ? filterAskingByIdentity(askingFiltered.rows, identity)
    : { rows: askingFiltered.rows, removed: 0, tier: "family" as const };
  const asking = summarize(askingIdentity.rows.map((r) => r.price));
  const askingDisplay = [...askingIdentity.rows].sort((a, b) => a.price - b.price).slice(0, 15);

  const matchTier =
    askingIdentity.tier !== "family"
      ? askingIdentity.tier
      : soldIdentity.tier !== "family"
        ? soldIdentity.tier
        : "family";

  const parts: string[] = [];
  if (soldGunFilter.removed > 0) {
    parts.push(`${soldGunFilter.removed} non-gun sold removed`);
  }
  if (soldIdentity.removed > 0) {
    parts.push(`${soldIdentity.removed} sold rows dropped (UPC/MPN/variant)`);
  }
  if (soldFilter.removed > 0) parts.push(`${soldFilter.removed} sold outliers removed`);
  if (askingFiltered.removed > 0) {
    parts.push(`${askingFiltered.removed} incomplete asking removed`);
  }
  if (askingIdentity.removed > 0) {
    parts.push(`${askingIdentity.removed} asking rows dropped (UPC/MPN/new-only)`);
  }

  const tierNote = matchTierLabel(matchTier);
  const decisionNote =
    parts.length > 0
      ? `${tierNote} · FMV from ${sold.count} sold / ${asking.count} asking (${parts.join("; ")}).`
      : `${tierNote} · FMV from ${sold.count} sold / ${asking.count} asking comps.`;

  const meta: CompFilterMeta = {
    soldRawCount: soldRows.length,
    soldDecisionCount: sold.count,
    soldOutliersRemoved: soldFilter.removed,
    soldNonFirearmRemoved: soldGunFilter.removed,
    askingRawCount: askingRows.length,
    askingDecisionCount: asking.count,
    askingIncompleteRemoved: askingFiltered.removed,
    identityRemovedSold: soldIdentity.removed,
    identityRemovedAsking: askingIdentity.removed,
    matchTier,
    enrichNotes,
    decisionNote,
  };

  return { sold, asking, soldDisplay, askingDisplay, meta };
}

/** Wholesale/catalog row — same rules as comp titles. */
export function isNonFirearmCatalogLine(fields: {
  model: string;
  description?: string | null;
  category?: string | null;
}): boolean {
  const blob = `${fields.category ?? ""} ${fields.model} ${fields.description ?? ""}`.toLowerCase();
  if (NON_FIREARM_CATEGORY.test(blob)) return true;
  if (NON_FIREARM_TITLE.test(blob)) return true;
  if (/\bglk\s*mag\b|\bglock\s*mag\b|\bruger\s*bx\b/.test(blob)) return true;
  if (/\bcombination\b.*\b(base|mount)\b/.test(blob)) return true;
  return false;
}
