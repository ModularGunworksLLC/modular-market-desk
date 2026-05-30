/** Definitive GO / NO-GO. GO only when BOTH the profit and margin floors are cleared. */

import type { Verdict } from "./types";

export function decideVerdict(params: {
  netProfit: number;
  marginPct: number;
  targetProfit: number;
  minMarginPct: number;
}): Verdict {
  const { netProfit, marginPct, targetProfit, minMarginPct } = params;
  return netProfit >= targetProfit && marginPct >= minMarginPct ? "GO" : "NO-GO";
}
