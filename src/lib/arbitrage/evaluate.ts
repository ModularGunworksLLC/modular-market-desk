/**
 * evaluateDeal - the full arbitrage decision.
 *
 * For each SOLD percentile scenario (P25 / Median / P75):
 *   - compute Route A (GunBroker) and Route B (Local AL) net proceeds
 *   - pick the higher-netting route (bestNet)
 *   - netProfit = bestNet - allInCost ; marginPct = netProfit / allInCost
 *   - maxBid = highest hammer that still clears target profit + min margin
 * The decision scenario is Median. Verdict + headline numbers come from it.
 */

import { allInCost as computeAllIn } from "./acquisition";
import { maxBid } from "./maxBid";
import { round2 } from "./fees";
import { routeGunBroker, routeLocalAlabama } from "./routes";
import type {
  DealInput,
  EvaluationResult,
  PriceStats,
  ScenarioLabel,
  ScenarioResult,
} from "./types";
import { decideVerdict } from "./verdict";

const SCENARIOS: { label: ScenarioLabel; pick: (s: PriceStats) => number }[] = [
  { label: "P25", pick: (s) => s.p25 },
  { label: "Median", pick: (s) => s.median },
  { label: "P75", pick: (s) => s.p75 },
];

function evaluateScenario(
  label: ScenarioLabel,
  sellPrice: number,
  input: DealInput,
  allIn: number,
): ScenarioResult {
  const routeA = routeGunBroker({
    sellPrice,
    outboundShip: input.outboundShip,
    listingUpgrades: input.listingUpgrades,
  });
  const routeB = routeLocalAlabama({ sellPrice });

  const bestRoute = routeA.net >= routeB.net ? "gunbroker" : "local_al";
  const bestNet = Math.max(routeA.net, routeB.net);
  const netProfit = bestNet - allIn;
  const marginPct = allIn > 0 ? (netProfit / allIn) * 100 : 0;

  return {
    label,
    sellPrice: round2(sellPrice),
    routeA,
    routeB,
    bestRoute,
    bestNet: round2(bestNet),
    netProfit: round2(netProfit),
    marginPct: round2(marginPct),
    maxBid: maxBid({
      bestNet,
      targetProfit: input.targetProfit,
      minMarginPct: input.minMarginPct,
      inboundShip: input.inboundShip,
      buyerPremiumPct: input.buyerPremiumPct,
    }),
  };
}

export function evaluateDeal(input: DealInput, sold: PriceStats): EvaluationResult {
  const allIn = computeAllIn(input);

  const scenarios = SCENARIOS.map(({ label, pick }) =>
    evaluateScenario(label, pick(sold), input, allIn),
  );

  // Decision scenario = Median (index 1); fall back to first if missing.
  const chosen = scenarios[1] ?? scenarios[0]!;

  const verdict = decideVerdict({
    netProfit: chosen.netProfit,
    marginPct: chosen.marginPct,
    targetProfit: input.targetProfit,
    minMarginPct: input.minMarginPct,
  });

  return {
    input,
    allInCost: round2(allIn),
    sold,
    scenarios,
    chosen,
    verdict,
    bestRoute: chosen.bestRoute,
    maxBid: chosen.maxBid,
    netProfit: chosen.netProfit,
    marginPct: chosen.marginPct,
  };
}
