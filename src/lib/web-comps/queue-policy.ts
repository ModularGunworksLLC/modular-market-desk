/**
 * Final labels for the web-comps drip. Pure so the queue can persist whatever
 * this returns without the tests opening SQLite.
 */

import type { WebEnrichPhase } from "./types";

export const NO_OA_COMPS_LABEL = "No OA Comps (No Max Bid)";

export function webCompsBudgetLabel(maxPerDay: number): string {
  return `Web-comps daily limit reached (${maxPerDay}/day) — this row was not looked up`;
}

export const WEAK_FINAL_LABEL =
  "Weak — final (street asks below confidence; no OA Max Bid)";

export function webEnrichOutcome(params: {
  soldCount: number;
  reason: string;
  confidence?: string | null;
  askCount?: number;
  maxPerDay?: number;
}): { phase: WebEnrichPhase; note: string } {
  if (params.soldCount > 0) {
    return { phase: "oa", note: "OA solds drive money math" };
  }
  const maxPerDay = params.maxPerDay ?? 50;
  if (params.reason === "daily_budget" || params.reason === "budget") {
    return { phase: "budget", note: webCompsBudgetLabel(maxPerDay) };
  }
  if (params.reason === "already_fresh_high") {
    return { phase: "ready", note: NO_OA_COMPS_LABEL };
  }
  const confidence = (params.confidence ?? "").toLowerCase();
  const asks = params.askCount ?? 0;
  if (confidence === "medium" || confidence === "low" || confidence === "weak") {
    return { phase: "weak", note: WEAK_FINAL_LABEL };
  }
  if (params.reason === "enqueued" || params.reason === "already_queued") {
    return { phase: "queued", note: NO_OA_COMPS_LABEL };
  }
  if (asks > 0) {
    return { phase: "weak", note: `${WEAK_FINAL_LABEL} · street asks n=${asks}` };
  }
  return { phase: "skipped", note: NO_OA_COMPS_LABEL };
}
