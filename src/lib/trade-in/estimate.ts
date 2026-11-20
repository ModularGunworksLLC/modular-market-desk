/**
 * Public trade-in estimate: USED sold P25 → dual-exit max offers → customer sees min.
 * Target profit is $100 (TRADE_IN_TARGET_PROFIT), separate from desk DEAL_TARGET_PROFIT.
 */

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";
import { round2 } from "@/lib/arbitrage/fees";
import { maxBid } from "@/lib/arbitrage/maxBid";
import { routeGunBroker, routeLocalAlabama } from "@/lib/arbitrage/routes";
import { loadLocalMarket } from "@/lib/oa/local-comps";
import { loadDepsAndResolve } from "@/lib/oa/resolve-local";

/** Minimum USED sold comps before showing a dollar on the public form. */
export const TRADE_IN_MIN_SOLD_COUNT = 5;

/** Public trade-in profit floor — not the desk Evaluate $50 default. */
export function tradeInTargetProfit(): number {
  const raw = process.env.TRADE_IN_TARGET_PROFIT;
  if (raw == null || raw.trim() === "") return 100;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 100;
}

export type TradeInOfferBreakdown = {
  marketP25: number;
  localNet: number;
  gbNet: number;
  localMaxOffer: number;
  gbMaxOffer: number;
  /** Lower of Local / GB — what the customer may see. */
  customerOffer: number;
  targetProfit: number;
  minMarginPct: number;
};

/**
 * Pure: from a market sold P25, compute Local + GB max pay ceilings and take min.
 * Trade-in buy-side: BP = 0, inbound = 0.
 */
export function tradeInOfferFromMarketP25(params: {
  marketP25: number;
  targetProfit: number;
  minMarginPct: number;
  salesTaxRate: number;
  outboundShip: number;
  listingUpgrades: number;
  buyerPaysOutboundShip?: boolean;
  buyerPaysCardFee?: boolean;
}): TradeInOfferBreakdown {
  const G = Math.max(0, params.marketP25);
  const local = routeLocalAlabama({
    sellPrice: G,
    salesTaxRate: params.salesTaxRate,
  });
  const gb = routeGunBroker({
    sellPrice: G,
    outboundShip: params.outboundShip,
    listingUpgrades: params.listingUpgrades,
    buyerPaysOutboundShip: params.buyerPaysOutboundShip,
    buyerPaysCardFee: params.buyerPaysCardFee,
  });

  const bidParams = {
    targetProfit: params.targetProfit,
    minMarginPct: params.minMarginPct,
    inboundShip: 0,
    buyerPremiumPct: 0,
  };
  const localMaxOffer = maxBid({ bestNet: local.net, ...bidParams });
  const gbMaxOffer = maxBid({ bestNet: gb.net, ...bidParams });
  const customerOffer = round2(Math.min(localMaxOffer, gbMaxOffer));

  return {
    marketP25: round2(G),
    localNet: local.net,
    gbNet: gb.net,
    localMaxOffer,
    gbMaxOffer,
    customerOffer,
    targetProfit: params.targetProfit,
    minMarginPct: params.minMarginPct,
  };
}

export type TradeInEstimateResult = {
  ok: boolean;
  /** Shown customer offer (profit-safe ceiling), stored in estimate_p25. */
  estimateP25: number | null;
  soldCount: number;
  /** Customer-facing short line. */
  label: string;
  /** Richer line for inbox / email (includes market P25 + both exit ceilings). */
  staffLabel: string;
  matchedManufacturer: string | null;
  matchedModel: string | null;
  matchedCaliber: string | null;
  oaModelId: number | null;
  oaCaliberId: number | null;
  message: string;
};

function emptyResult(
  partial: Partial<TradeInEstimateResult> & { message: string },
): TradeInEstimateResult {
  return {
    ok: false,
    estimateP25: null,
    soldCount: 0,
    label: "",
    staffLabel: "",
    matchedManufacturer: null,
    matchedModel: null,
    matchedCaliber: null,
    oaModelId: null,
    oaCaliberId: null,
    ...partial,
  };
}

export async function estimateTradeInInterest(args: {
  manufacturer: string;
  model: string;
  caliber?: string;
}): Promise<TradeInEstimateResult> {
  const manufacturer = args.manufacturer.trim();
  const model = args.model.trim();
  if (!manufacturer || !model) {
    return emptyResult({ message: "Enter make and model." });
  }

  const selection = await loadDepsAndResolve({
    manufacturer,
    model,
    caliber: args.caliber?.trim() || undefined,
    condition: "used",
  });

  if (!selection) {
    return emptyResult({
      message: "No market match yet — still submit with photos and we will review manually.",
    });
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
  const matched = {
    matchedManufacturer: selection.manufacturer,
    matchedModel: selection.model,
    matchedCaliber: selection.caliber,
    oaModelId: selection.modelId,
    oaCaliberId: selection.caliberId,
    soldCount,
  };

  if (p25 == null || !(p25 > 0)) {
    return emptyResult({
      ...matched,
      message: "Matched the model but no used sold comps yet — submit with photos for manual review.",
    });
  }

  if (soldCount < TRADE_IN_MIN_SOLD_COUNT) {
    return emptyResult({
      ...matched,
      message: `Only ${soldCount} used sold comps — submit with photos for manual review (need ${TRADE_IN_MIN_SOLD_COUNT}+ for an estimate).`,
    });
  }

  const targetProfit = tradeInTargetProfit();
  const offer = tradeInOfferFromMarketP25({
    marketP25: p25,
    targetProfit,
    minMarginPct: DEAL_DEFAULTS.minMarginPct,
    salesTaxRate: DEAL_DEFAULTS.salesTaxPct / 100,
    outboundShip: DEAL_DEFAULTS.outboundShip,
    listingUpgrades: DEAL_DEFAULTS.listingUpgrades,
    buyerPaysOutboundShip: DEAL_DEFAULTS.buyerPaysOutboundShip,
    buyerPaysCardFee: DEAL_DEFAULTS.buyerPaysCardFee,
  });

  if (!(offer.customerOffer > 0)) {
    return emptyResult({
      ...matched,
      message:
        "Market comps found but no safe trade interest after fees and profit floor — submit with photos for manual review.",
    });
  }

  const staffContext = `Market P25 $${offer.marketP25.toFixed(2)} · Local max $${offer.localMaxOffer.toFixed(2)} · GB max $${offer.gbMaxOffer.toFixed(2)} · $${targetProfit} profit floor · dual-exit safe`;

  return {
    ok: true,
    estimateP25: offer.customerOffer,
    soldCount,
    label: `Estimated trade interest up to ~$${offer.customerOffer.toFixed(2)}`,
    staffLabel: `Customer ceiling ~$${offer.customerOffer.toFixed(2)} (${staffContext})`,
    matchedManufacturer: selection.manufacturer,
    matchedModel: selection.model,
    matchedCaliber: selection.caliber,
    oaModelId: selection.modelId,
    oaCaliberId: selection.caliberId,
    message: `Soft estimate after typical resale fees (local tax or GunBroker) and a $${targetProfit} profit floor — not a binding offer. Final value after in-person inspection.`,
  };
}
