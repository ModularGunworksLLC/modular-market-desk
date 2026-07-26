/**
 * Conservative public trade-in estimate: USED sold P25 from local OA bank only.
 */

import { loadLocalMarket } from "@/lib/oa/local-comps";
import { loadDepsAndResolve } from "@/lib/oa/resolve-local";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type TradeInEstimateResult = {
  ok: boolean;
  estimateP25: number | null;
  soldCount: number;
  label: string;
  matchedManufacturer: string | null;
  matchedModel: string | null;
  matchedCaliber: string | null;
  oaModelId: number | null;
  oaCaliberId: number | null;
  message: string;
};

export async function estimateTradeInInterest(args: {
  manufacturer: string;
  model: string;
  caliber?: string;
}): Promise<TradeInEstimateResult> {
  const manufacturer = args.manufacturer.trim();
  const model = args.model.trim();
  if (!manufacturer || !model) {
    return {
      ok: false,
      estimateP25: null,
      soldCount: 0,
      label: "",
      matchedManufacturer: null,
      matchedModel: null,
      matchedCaliber: null,
      oaModelId: null,
      oaCaliberId: null,
      message: "Enter make and model.",
    };
  }

  const selection = await loadDepsAndResolve({
    manufacturer,
    model,
    caliber: args.caliber?.trim() || undefined,
    condition: "used",
  });

  if (!selection) {
    return {
      ok: false,
      estimateP25: null,
      soldCount: 0,
      label: "",
      matchedManufacturer: null,
      matchedModel: null,
      matchedCaliber: null,
      oaModelId: null,
      oaCaliberId: null,
      message: "No market match yet — still submit with photos and we will review manually.",
    };
  }

  const local = await loadLocalMarket({
    modelId: selection.modelId,
    caliberId: selection.caliberId,
    condition: "Used",
    manufacturer: selection.manufacturer,
    model: selection.model,
    caliber: selection.caliber,
  });

  const soldCount = local?.sold.count ?? 0;
  const p25 = local && soldCount > 0 ? local.sold.p25 : null;

  if (p25 == null || !(p25 > 0)) {
    return {
      ok: false,
      estimateP25: null,
      soldCount,
      label: "",
      matchedManufacturer: selection.manufacturer,
      matchedModel: selection.model,
      matchedCaliber: selection.caliber,
      oaModelId: selection.modelId,
      oaCaliberId: selection.caliberId,
      message: "Matched the model but no used sold comps yet — submit with photos for manual review.",
    };
  }

  const estimate = round2(p25);
  return {
    ok: true,
    estimateP25: estimate,
    soldCount,
    label: `Estimated trade interest ~$${estimate.toFixed(2)}`,
    matchedManufacturer: selection.manufacturer,
    matchedModel: selection.model,
    matchedCaliber: selection.caliber,
    oaModelId: selection.modelId,
    oaCaliberId: selection.caliberId,
    message:
      "Soft estimate from recent used solds (conservative). Not a binding offer — final value after in-person inspection.",
  };
}
