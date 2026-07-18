/**
 * Flag suspicious OA identity matches: lot bid/cost nowhere near OA solds,
 * and/or web street prices disagree with OA. Advisory only — does not blend prices.
 */

import type { WebCompsSummary } from "@/lib/web-comps/types";

export type MatchSuspicion = {
  suspicious: boolean;
  warnings: string[];
  /** oaMedian / bid when both present */
  oaToBidRatio: number | null;
};

/**
 * bidOrCost = next legal hammer / acquisition being evaluated.
 * OA median from sold comps; webMedian when medium/high local web stats exist.
 */
export function assessMatchSuspicion(opts: {
  bidOrCost: number;
  oaMedian: number | null | undefined;
  oaCount: number;
  webMedian?: number | null;
  webAgreement?: WebCompsSummary["agreement"];
  /** oaMedian / bid above this → OA looks far too expensive for this lot */
  highRatio?: number;
  /** oaMedian / bid below this → OA looks far too cheap (wrong leaf / accessories) */
  lowRatio?: number;
}): MatchSuspicion {
  const warnings: string[] = [];
  const bid = opts.bidOrCost;
  const oa = opts.oaMedian;
  const highRatio = opts.highRatio ?? 2.5;
  const lowRatio = opts.lowRatio ?? 0.4;

  let oaToBidRatio: number | null = null;
  if (bid > 0 && oa != null && oa > 0 && opts.oaCount > 0) {
    oaToBidRatio = oa / bid;
    if (oaToBidRatio >= highRatio) {
      warnings.push(
        `Suspicious OA match: sold median $${oa.toFixed(0)} is ${oaToBidRatio.toFixed(1)}× this lot’s bid/cost $${bid.toFixed(0)} — likely wrong identity (ammo/mag/wrong leaf)`,
      );
    } else if (oaToBidRatio <= lowRatio) {
      warnings.push(
        `Suspicious OA match: sold median $${oa.toFixed(0)} is well below this lot’s bid/cost $${bid.toFixed(0)} — re-check Make/Model`,
      );
    }
  }

  if (opts.webAgreement === "web_higher") {
    warnings.push(
      "Web street asks run above OA solds — treat Max Bid cautiously; money still uses OA",
    );
  } else if (opts.webAgreement === "web_lower") {
    warnings.push(
      "Web below OA solds — possible wrong OA leaf or accessories in comps; money still uses OA",
    );
  }

  if (
    oa != null &&
    oa > 0 &&
    opts.webMedian != null &&
    opts.webMedian > 0 &&
    opts.webAgreement != null &&
    opts.webAgreement !== "agrees"
  ) {
    const spread = Math.abs(opts.webMedian - oa) / oa;
    if (spread >= 0.35) {
      warnings.push(
        `Large OA↔web gap: OA median $${oa.toFixed(0)} vs web $${opts.webMedian.toFixed(0)} (${(spread * 100).toFixed(0)}%)`,
      );
    }
  }

  return { suspicious: warnings.length > 0, warnings, oaToBidRatio };
}
