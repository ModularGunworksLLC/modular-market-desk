/** Definitive GO / NO-GO with mode-aware rules. */

import { NEW_FLOOR_BUFFER, violatesNewFloor } from "./new-floor";
import type { Verdict } from "./types";
import type { Workflow } from "@/lib/desk-mode";

export interface VerdictInput {
  netProfit: number;
  targetProfit: number;
  workflow: Workflow;
  allInCost: number;
  dealerFloor: number | null | undefined;
  wholesaleCheaperExists: boolean;
  askingCount: number;
  cheapestWholesaleVendor?: string | null;
  cheapestWholesalePrice?: number | null;
}

export interface VerdictResult {
  verdict: Verdict;
  reasons: string[];
}

export function decideVerdict(params: { netProfit: number; targetProfit: number }): Verdict {
  return params.netProfit >= params.targetProfit ? "GO" : "NO-GO";
}

export function decideVerdictFull(input: VerdictInput): VerdictResult {
  const reasons: string[] = [];
  let verdict: Verdict = "GO";

  if (input.netProfit < input.targetProfit) {
    reasons.push(
      `Profit $${input.netProfit.toFixed(2)} is below $${input.targetProfit.toFixed(2)} target.`,
    );
    verdict = "NO-GO";
  }

  if (input.workflow === "vendor") {
    if (input.askingCount === 0) {
      reasons.push("No active asking comps — cannot price new street competition.");
      verdict = "NO-GO";
    }
    if (input.wholesaleCheaperExists) {
      const vendor = input.cheapestWholesaleVendor ?? "a distributor";
      const price = input.cheapestWholesalePrice;
      reasons.push(
        price != null
          ? `${vendor} in stock at $${price.toFixed(2)} beats your cost.`
          : "A distributor in your catalogs beats your cost.",
      );
      verdict = "NO-GO";
    }
  }

  if (input.workflow === "used" && violatesNewFloor(input.allInCost, input.dealerFloor)) {
    const floor = input.dealerFloor ?? 0;
    reasons.push(
      `All-in within $${NEW_FLOOR_BUFFER} of new wholesale ($${floor.toFixed(2)}) — pass on used at new money.`,
    );
    verdict = "NO-GO";
  }

  if (verdict === "GO" && reasons.length === 0) {
    reasons.push("Clears profit floor and sourcing rules.");
  }

  return { verdict, reasons };
}

/** Hero viability for used modes: a positive walk-away exists with comps. */
export function heroViable(params: {
  effectiveMaxHammer: number;
  compCount: number;
}): boolean {
  return params.compCount > 0 && params.effectiveMaxHammer > 0;
}
