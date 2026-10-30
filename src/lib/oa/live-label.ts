/**
 * How Evaluate/Batch must describe comps when live Outdoor Analytics is down.
 * Pricing numbers are chosen by the caller; this module only labels them.
 */

import type { OaBlockReason } from "@/lib/oa/status";

export type { OaBlockReason } from "@/lib/oa/status";

export type OaDataSource = "live" | "cache" | "manual" | "none";

export interface OaAvailability {
  dataSource: OaDataSource;
  liveUnavailable: boolean;
  reason: OaBlockReason | null;
  /** Loud sentence for the result banner. Null when live data is healthy. */
  banner: string | null;
}

export interface DescribeOaMarketInput {
  block: OaBlockReason | null;
  /** HTTP status from the live call, when one was made. */
  liveHttpStatus: number | null;
  used: OaDataSource;
  hasComps: boolean;
  cacheSource: string | null;
  liveSource: string | null;
}

export interface DescribedOaMarket {
  availability: OaAvailability;
  sourceLabel: string;
}

const REASON_TEXT: Record<OaBlockReason, string> = {
  missing: "token missing",
  expired: "token expired",
  unauthorized: "token unauthorized",
};

export function liveOaUnavailableBanner(reason: OaBlockReason, used: OaDataSource, hasComps: boolean): string {
  const why = REASON_TEXT[reason];
  if (used === "cache" && hasComps) {
    return `Live OA data unavailable: ${why}. Results below use the local catalog cache and may be stale.`;
  }
  if (used === "manual") {
    return `Live OA data unavailable: ${why}. Results below use the manual prices you entered, not live OA.`;
  }
  return `Live OA data unavailable: ${why}. No local catalog cache is available for this item.`;
}

export function emptyOaAvailability(): OaAvailability {
  return { dataSource: "none", liveUnavailable: false, reason: null, banner: null };
}

function cacheSourceLabel(cacheSource: string | null): string {
  const base = cacheSource?.trim() || "local cache";
  if (/not live/i.test(base)) return base;
  return `${base} — not live OA`;
}

/**
 * Label a market result. A 401 always becomes unauthorized, even if the clock
 * still thinks the token is valid. Cache numbers stay cache numbers.
 */
export function describeOaMarket(input: DescribeOaMarketInput): DescribedOaMarket {
  const reason: OaBlockReason | null =
    input.liveHttpStatus === 401 ? "unauthorized" : input.block;

  if (input.used === "live" && reason == null) {
    return {
      availability: {
        dataSource: "live",
        liveUnavailable: false,
        reason: null,
        banner: null,
      },
      sourceLabel: input.liveSource?.trim() || "live OA",
    };
  }

  if (reason == null) {
    if (input.used === "cache") {
      return {
        availability: {
          dataSource: "cache",
          liveUnavailable: false,
          reason: null,
          banner: null,
        },
        sourceLabel: cacheSourceLabel(input.cacheSource),
      };
    }
    if (input.used === "manual") {
      return {
        availability: {
          dataSource: "manual",
          liveUnavailable: false,
          reason: null,
          banner: null,
        },
        sourceLabel: "manual comps (not live OA)",
      };
    }
    return {
      availability: emptyOaAvailability(),
      sourceLabel: input.liveSource?.trim() || "no live OA comps",
    };
  }

  const used: OaDataSource = input.used === "live" ? "none" : input.used;
  const banner = liveOaUnavailableBanner(reason, used, input.hasComps);
  const sourceLabel =
    used === "cache"
      ? cacheSourceLabel(input.cacheSource)
      : used === "manual"
        ? "manual comps (not live OA)"
        : banner;

  return {
    availability: {
      dataSource: used === "cache" && input.hasComps ? "cache" : used === "manual" ? "manual" : "none",
      liveUnavailable: true,
      reason,
      banner,
    },
    sourceLabel,
  };
}

export function weeklySyncFailureNote(block: OaBlockReason): string {
  const why = REASON_TEXT[block];
  return `Weekly market sync failed: live OA data unavailable (${why}). The OA catalog was not refreshed. The desk banner stays in an error state until you connect OA again.`;
}

export class OaTokenBlockedError extends Error {
  readonly block: OaBlockReason;

  constructor(block: OaBlockReason, message?: string) {
    super(message ?? weeklySyncFailureNote(block));
    this.name = "OaTokenBlockedError";
    this.block = block;
  }
}
