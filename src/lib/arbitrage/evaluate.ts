/**
 * evaluateDeal - the full arbitrage decision.
 *
 * For each SOLD percentile scenario (P25 / Median / P75):
 *   - compute Route A (GunBroker) and Route B (Local AL) net proceeds
 *   - scenario.maxBid / localMaxBid are profit-only hammers per route
 *
 * Both exits are always finalized on `result.exits` (new-floor + GO/NO-GO).
 * Selected sellChannel still drives the legacy headline fields for callers
 * that have not moved to dual-exit UI.
 */

import { allInCost as computeAllIn } from "./acquisition";
import { maxBid } from "./maxBid";
import { round2 } from "./fees";
import { routeGunBroker, routeLocalAlabama } from "./routes";
import { effectiveHammerCeiling } from "./new-floor";
import type {
  DealInput,
  DecisionAnchor,
  EvaluationResult,
  ExitDecision,
  PriceStats,
  ScenarioLabel,
  ScenarioResult,
} from "./types";
import { decideVerdictFull } from "./verdict";

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
    buyerPaysOutboundShip: input.buyerPaysOutboundShip,
    buyerPaysCardFee: input.buyerPaysCardFee,
  });
  const routeB = routeLocalAlabama({
    sellPrice,
    salesTaxRate: input.salesTaxRate,
  });

  const gbNet = routeA.net;
  const localNet = routeB.net;
  const netProfit = gbNet - allIn;
  const localProfit = localNet - allIn;
  const marginPct = allIn > 0 ? (netProfit / allIn) * 100 : 0;
  const localMarginPct = allIn > 0 ? (localProfit / allIn) * 100 : 0;

  const bidParams = {
    targetProfit: input.targetProfit,
    minMarginPct: input.minMarginPct,
    inboundShip: input.inboundShip,
    buyerPremiumPct: input.buyerPremiumPct,
  };

  return {
    label,
    sellPrice: round2(sellPrice),
    routeA,
    routeB,
    bestRoute: gbNet >= localNet ? "gunbroker" : "local_al",
    bestNet: round2(Math.max(gbNet, localNet)),
    netProfit: round2(netProfit),
    marginPct: round2(marginPct),
    maxBid: maxBid({ bestNet: gbNet, ...bidParams }),
    localProfit: round2(localProfit),
    localMarginPct: round2(localMarginPct),
    localMaxBid: maxBid({ bestNet: localNet, ...bidParams }),
    profitUpside: round2(Math.max(0, localProfit - netProfit)),
  };
}

export interface EvaluateDealOptions {
  /** Vendor mode: lowest active ask. Used mode: omit → P25 sold. */
  anchorSellPrice?: number;
  decisionAnchor?: DecisionAnchor;
  dealerFloor?: number | null;
  workflow?: "used" | "vendor";
  wholesaleCheaperExists?: boolean;
  askingCount?: number;
  cheapestWholesaleVendor?: string | null;
  cheapestWholesalePrice?: number | null;
}

function buildExitDecision(params: {
  profitMaxBid: number;
  netProfit: number;
  marginPct: number;
  input: DealInput;
  allIn: number;
  opts?: EvaluateDealOptions;
  workflow: "used" | "vendor";
}): ExitDecision {
  const maxBidEff = effectiveHammerCeiling({
    profitMaxHammer: params.profitMaxBid,
    dealerFloor: params.opts?.dealerFloor,
    inboundShip: params.input.inboundShip,
    buyerPremiumPct: params.input.buyerPremiumPct,
    applyNewFloor: params.workflow === "used",
  });
  const { verdict, reasons } = decideVerdictFull({
    netProfit: params.netProfit,
    targetProfit: params.input.targetProfit,
    marginPct: params.marginPct,
    minMarginPct: params.input.minMarginPct,
    workflow: params.workflow,
    allInCost: params.allIn,
    dealerFloor: params.opts?.dealerFloor,
    wholesaleCheaperExists: params.opts?.wholesaleCheaperExists ?? false,
    askingCount: params.opts?.askingCount ?? 0,
    cheapestWholesaleVendor: params.opts?.cheapestWholesaleVendor,
    cheapestWholesalePrice: params.opts?.cheapestWholesalePrice,
  });
  return {
    maxBid: maxBidEff,
    profitMaxBid: round2(Math.max(0, params.profitMaxBid)),
    netProfit: round2(params.netProfit),
    marginPct: round2(params.marginPct),
    verdict,
    verdictReasons: reasons,
  };
}

export function evaluateDeal(
  input: DealInput,
  sold: PriceStats,
  opts?: EvaluateDealOptions,
): EvaluationResult {
  const allIn = computeAllIn(input);
  const workflow = opts?.workflow ?? "used";

  const scenarios = SCENARIOS.map(({ label, pick }) =>
    evaluateScenario(label, pick(sold), input, allIn),
  );

  const anchorSell =
    opts?.anchorSellPrice != null && opts.anchorSellPrice > 0
      ? opts.anchorSellPrice
      : sold.count > 0
        ? sold.p25
        : 0;

  const decisionAnchor: DecisionAnchor =
    opts?.decisionAnchor ??
    (opts?.anchorSellPrice != null && opts.anchorSellPrice > 0 ? "low-asking" : "p25-sold");

  const chosen =
    decisionAnchor === "low-asking" && anchorSell > 0
      ? evaluateScenario("P25", anchorSell, input, allIn)
      : scenarios[0] ?? evaluateScenario("P25", anchorSell, input, allIn);

  const gunbroker = buildExitDecision({
    profitMaxBid: chosen.maxBid,
    netProfit: chosen.netProfit,
    marginPct: chosen.marginPct,
    input,
    allIn,
    opts,
    workflow,
  });
  const local = buildExitDecision({
    profitMaxBid: chosen.localMaxBid,
    netProfit: chosen.localProfit,
    marginPct: chosen.localMarginPct,
    input,
    allIn,
    opts,
    workflow,
  });

  const useLocal = input.sellChannel === "local";
  const selected = useLocal ? local : gunbroker;
  const decisionRoute = useLocal ? ("local_al" as const) : ("gunbroker" as const);

  return {
    input,
    allInCost: round2(allIn),
    sold,
    scenarios,
    chosen,
    exits: { gunbroker, local },
    verdict: selected.verdict,
    verdictReasons: selected.verdictReasons,
    decisionAnchor,
    decisionSellPrice: round2(anchorSell),
    decisionRoute,
    upsideRoute: chosen.bestRoute,
    profitMaxHammer: selected.profitMaxBid,
    effectiveMaxHammer: selected.maxBid,
    maxBid: selected.maxBid,
    netProfit: selected.netProfit,
    marginPct: selected.marginPct,
    localNetProfit: local.netProfit,
    localMaxBid: local.maxBid,
    profitUpside: chosen.profitUpside,
  };
}
