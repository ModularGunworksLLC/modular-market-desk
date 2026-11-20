/**
 * OA token / comp-age labels. Does not refresh or rewrite the token.
 */

export const DEFAULT_OA_STALE_DAYS = 14;

export function oaStaleDaysThreshold(): number {
  const n = Number(process.env.OA_STALE_DAYS ?? DEFAULT_OA_STALE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_OA_STALE_DAYS;
}

export function oaCompAgeDays(
  syncedAt: Date | string | number | null | undefined,
  now: Date = new Date(),
): number | null {
  if (syncedAt == null || syncedAt === "") return null;
  const ts =
    syncedAt instanceof Date
      ? syncedAt.getTime()
      : typeof syncedAt === "number"
        ? syncedAt > 10_000_000_000
          ? syncedAt
          : syncedAt * 1000
        : Date.parse(syncedAt);
  if (!Number.isFinite(ts)) return null;
  const days = (now.getTime() - ts) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 0;
  return Math.floor(days);
}

export function isOaCompStale(
  ageDays: number | null,
  threshold: number = DEFAULT_OA_STALE_DAYS,
): boolean {
  return ageDays != null && ageDays > threshold;
}

export function formatOaMatchLabel(params: {
  manufacturer: string;
  model: string;
  caliber?: string | null;
  condition?: string | null;
  soldCount: number;
  score: number | null;
  ageDays?: number | null;
  stale?: boolean;
  lowConfidence?: boolean;
  insufficientUsed?: boolean;
}): string {
  const cal = params.caliber?.trim() ? ` ${params.caliber.trim()}` : "";
  const cond = params.condition?.trim() ? ` (${params.condition.trim()})` : "";
  const score = params.score != null && Number.isFinite(params.score) ? `, score ${Math.round(params.score)}` : "";
  const age = params.ageDays != null ? ` · data age ${params.ageDays}d` : "";
  const stale = params.stale ? " · STALE" : "";
  const low = params.lowConfidence ? " · Low Confidence Match" : "";
  const used = params.insufficientUsed ? " · Insufficient Used data" : "";
  return `${params.manufacturer} ${params.model}${cal}${cond} — n=${params.soldCount}${score}${age}${stale}${low}${used}`.trim();
}

export function formatOaHealthBanner(params: {
  hasToken: boolean;
  lastError?: string | null;
  lastSyncedAt?: Date | string | number | null;
  now?: Date;
  staleDays?: number;
}): { tone: "ok" | "warn" | "bad"; text: string } {
  const threshold = params.staleDays ?? DEFAULT_OA_STALE_DAYS;
  const age = oaCompAgeDays(params.lastSyncedAt, params.now);
  const stale = isOaCompStale(age, threshold);
  const err = (params.lastError ?? "").trim();
  const unauthorized = /unauthorized|401/i.test(err);
  const ageText = age == null ? "comp age unknown" : `newest comps are ${age}d old`;

  if (!params.hasToken || unauthorized) {
    return {
      tone: "bad",
      text: `OA token needs a re-paste. ${unauthorized ? "Last refresh: Unauthorized." : "No Outdoor Analytics token stored."} ${ageText}. Pricing is using the local cache${stale ? " and it is stale" : ""}.`,
    };
  }
  if (stale || err) {
    return {
      tone: "warn",
      text: `OA comps are stale (${ageText}; threshold ${threshold}d).${err ? ` Last sync: ${err}.` : ""} Max hammer still uses the cache and each row is marked STALE.`,
    };
  }
  return {
    tone: "ok",
    text: `OA cache is within ${threshold}d (${ageText}).`,
  };
}
