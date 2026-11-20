/**
 * Display-only call / confidence chips for the ranked buy-sheet.
 * Does NOT change engine verdicts — maps existing flags for chrome only.
 */

import type { BatchResultRow } from "@/lib/batch/types";

export type DisplayCall = "GO" | "VERIFY" | "NO-GO" | "NEEDS FMV" | "—";
export type DisplayConf = "High" | "Med" | "Low" | "—";

export function hasFmv(row: BatchResultRow): boolean {
  return row.decisionP25 != null || row.soldMedian != null || row.estimatedGrossResale != null;
}

/** Thin / suspicious / family-match flags already on the row. */
export function needsVerifyChrome(row: BatchResultRow): boolean {
  if (row.matchWarnings?.length) return true;
  if (row.newDealerWarning) return true;
  if (row.divergence === "asks_rich" || row.divergence === "cooling") return true;
  if (row.soldCount > 0 && row.soldCount < 5) return true;
  const note = (row.matchNote || "").toLowerCase();
  if (note.includes("family") || note.includes("weak") || note.includes("partial")) return true;
  if (row.webEnrich?.phase === "weak") return true;
  return false;
}

export function displayCall(row: BatchResultRow): DisplayCall {
  if (row.error) return "—";
  if (!hasFmv(row) && (row.soldCount ?? 0) === 0) return "NEEDS FMV";
  if (row.verdict === "NO-GO") return "NO-GO";
  if (row.verdict === "GO") {
    return needsVerifyChrome(row) ? "VERIFY" : "GO";
  }
  if (!hasFmv(row)) return "NEEDS FMV";
  return "—";
}

export function displayConf(row: BatchResultRow): DisplayConf {
  if (row.error) return "—";
  const score = row.matchScore;
  const n = row.soldCount ?? 0;
  const webConf = row.webEnrich?.confidence;
  if (webConf === "high" || (score != null && score >= 70) || n >= 10) return "High";
  if (webConf === "medium" || (score != null && score >= 45) || n >= 5) return "Med";
  if (score != null || n > 0 || hasFmv(row)) return "Low";
  return "—";
}

export function callChipClass(call: DisplayCall): string {
  switch (call) {
    case "GO":
      return "border-desk-go bg-desk-go/20 text-desk-go";
    case "VERIFY":
      return "border-desk-warn bg-desk-warn/15 text-desk-warn";
    case "NO-GO":
      return "border-desk-nogo/70 bg-desk-nogo/10 text-desk-nogo";
    case "NEEDS FMV":
      return "border-desk-border bg-desk-panel2 text-desk-muted";
    default:
      return "border-desk-border text-desk-muted";
  }
}

export function confClass(conf: DisplayConf): string {
  switch (conf) {
    case "High":
      return "text-desk-go";
    case "Med":
      return "text-desk-warn";
    case "Low":
      return "text-desk-nogo";
    default:
      return "text-desk-muted";
  }
}
