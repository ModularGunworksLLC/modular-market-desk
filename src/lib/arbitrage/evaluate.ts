/**
 * evaluateDeal - the full arbitrage decision.
 *
 * For each SOLD percentile scenario (P25 / Median / P75):
 *   - compute Route A (GunBroker) and Route B (Local AL) net proceeds
 *   - conservative profit / maxBid / verdict use GunBroker (Route A) only
 *   - local profit / local maxBid exposed for side-by-side comparison
 * The decision scenario is P25 (conservative). Verdict + headline numbers come from it.
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

  const useLocal = input.sellChannel === "local";
  const decisionRoute = useLocal ? ("local_al" as const) : ("gunbroker" as const);
  const channelProfit = useLocal ? chosen.localProfit : chosen.netProfit;
  const channelMargin = useLocal ? chosen.localMarginPct : chosen.marginPct;
  const profitMaxHammer = useLocal ? chosen.localMaxBid : chosen.maxBid;
  const effectiveMaxHammer = effectiveHammerCeiling({
    profitMaxHammer,
    dealerFloor: opts?.dealerFloor,
    inboundShip: input.inboundShip,
    buyerPremiumPct: input.buyerPremiumPct,
    applyNewFloor: workflow === "used",
  });

  const { verdict, reasons } = decideVerdictFull({
    netProfit: channelProfit,
    targetProfit: input.targetProfit,
    workflow,
    allInCost: allIn,
    dealerFloor: opts?.dealerFloor,
    wholesaleCheaperExists: opts?.wholesaleCheaperExists ?? false,
    askingCount: opts?.askingCount ?? 0,
    cheapestWholesaleVendor: opts?.cheapestWholesaleVendor,
    cheapestWholesalePrice: opts?.cheapestWholesalePrice,
  });

  return {
    input,
    allInCost: round2(allIn),
    sold,
    scenarios,
    chosen,
    verdict,
    verdictReasons: reasons,
    decisionAnchor,
    decisionSellPrice: round2(anchorSell),
    decisionRoute,
    upsideRoute: chosen.bestRoute,
    profitMaxHammer,
    effectiveMaxHammer,
    maxBid: effectiveMaxHammer,
    netProfit: round2(channelProfit),
    marginPct: round2(channelMargin),
    localNetProfit: chosen.localProfit,
    localMaxBid: chosen.localMaxBid,
    profitUpside: chosen.profitUpside,
  };
}
