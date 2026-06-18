/**
 * Mode-aware decision copy and derived metrics for desk workflows.
 */

import type { EvaluationResult, PriceStats } from "@/lib/arbitrage/types";
import type { DeskModeId } from "@/lib/desk-mode";
import type { WholesaleGrid, WholesaleMatch } from "@/lib/wholesale";

/** @deprecated use DeskModeId */
export type AcquisitionMode = "auction" | "dealer";

export interface WholesaleRowInsight extends WholesaleMatch {
  savingsVsYourCost: number | null;
  isYourSource: boolean;
}

export interface DealInsights {
  modeId: DeskModeId;
  /** @deprecated */
  mode: AcquisitionMode;
  wholesaleRows: WholesaleRowInsight[];
  bestAlternate: {
    vendorName: string;
    productLabel: string;
    dealerPrice: number;
    savings: number;
    inStock: boolean;
  } | null;
  cheapestInStockDealer: {
    vendorName: string;
    productLabel: string;
    dealerPrice: number;
  } | null;
  /** Top in-stock vendor rows for hero (up to 3). */
  topVendorDeals: Array<{ vendorName: string; dealerPrice: number; inStock: boolean }>;
  cheapestInStock: number | null;
  lowestAsking: number | null;
  medianSold: number;
  askingMedian: number | null;
  marginAtMedian: number;
  marginPctAtMedian: number;
  marketTooSoft: boolean;
  headlines: string[];
}

import { TRACKED_VENDORS, VENDOR_LABELS, type TrackedVendor } from "@/lib/tracked-vendors";

const TRACKED_DEALERS = TRACKED_VENDORS;

function legacyMode(modeId: DeskModeId): AcquisitionMode {
  return modeId === "vendor" ? "dealer" : "auction";
}

function enrichWholesaleRows(
  matches: WholesaleMatch[],
  yourCost: number,
  sourceDealer?: string,
): WholesaleRowInsight[] {
  const src = sourceDealer?.trim().toLowerCase();
  return matches.map((m) => ({
    ...m,
    savingsVsYourCost:
      yourCost > 0 && m.dealerPrice < yourCost ? Math.round((yourCost - m.dealerPrice) * 100) / 100 : null,
    isYourSource: Boolean(src && m.vendorName.toLowerCase() === src),
  }));
}

function sortWholesaleRows(rows: WholesaleRowInsight[], modeId: DeskModeId): WholesaleRowInsight[] {
  const copy = [...rows];
  if (modeId === "vendor") {
    copy.sort((a, b) => {
      const aSave = a.savingsVsYourCost ?? -1;
      const bSave = b.savingsVsYourCost ?? -1;
      if (bSave !== aSave) return bSave - aSave;
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return a.dealerPrice - b.dealerPrice;
    });
    return copy;
  }
  copy.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.dealerPrice - b.dealerPrice;
  });
  return copy;
}

export function buildDealInsights(params: {
  modeId: DeskModeId;
  result: EvaluationResult;
  sold: PriceStats;
  asking: PriceStats;
  wholesale: WholesaleGrid;
  sourceDealer?: string;
}): DealInsights {
  const { modeId, result, sold, asking, wholesale } = params;
  const yourCost = result.allInCost;
  const wholesaleRows = sortWholesaleRows(
    enrichWholesaleRows(wholesale.matches, yourCost, params.sourceDealer),
    modeId,
  );

  const inStock = wholesaleRows.filter((m) => m.inStock);
  const cheapestInStock =
    inStock.length > 0 ? Math.min(...inStock.map((m) => m.dealerPrice)) : wholesale.cheapestInStockFirearm;

  const bestAlternate = wholesaleRows.find(
    (m) => m.savingsVsYourCost != null && m.savingsVsYourCost > 0 && m.inStock,
  );

  const cheapestInStockRow = inStock.reduce<WholesaleRowInsight | null>((lo, m) => {
    if (lo == null || m.dealerPrice < lo.dealerPrice) return m;
    return lo;
  }, null);

  const topVendorDeals = inStock
    .slice(0, 3)
    .map((m) => ({ vendorName: m.vendorName, dealerPrice: m.dealerPrice, inStock: m.inStock }));

  const medianSold = sold.median;
  const anchorPrice = result.decisionSellPrice;
  const askingMedian = asking.count > 0 ? asking.median : null;
  const lowestAsking = asking.count > 0 ? asking.low : null;
  const profitAtAnchor = result.netProfit;
  const marginPctAtAnchor = result.marginPct;

  const marketTooSoft =
    askingMedian != null && askingMedian > 0 && askingMedian <= yourCost * 1.05;

  const headlines: string[] = [];

  if (modeId === "vendor") {
    if (bestAlternate) {
      headlines.push(
        `Save $${bestAlternate.savingsVsYourCost!.toFixed(2)} — ${bestAlternate.vendorName} in stock at $${bestAlternate.dealerPrice.toFixed(2)} vs your $${yourCost.toFixed(2)}.`,
      );
    } else if (cheapestInStock != null && cheapestInStock < yourCost) {
      headlines.push(
        `Another dealer beats your price: in-stock floor $${cheapestInStock.toFixed(2)} vs your $${yourCost.toFixed(2)}.`,
      );
    } else if (cheapestInStock != null) {
      headlines.push(`Your cost is at or below the in-stock floor ($${cheapestInStock.toFixed(2)}).`);
    } else if (wholesaleRows.length === 0) {
      headlines.push("No wholesale firearm match — import catalogs on /import.");
    }

    if (lowestAsking != null) {
      headlines.push(
        `Lowest active ask $${lowestAsking.toFixed(2)} → est. profit $${profitAtAnchor.toFixed(2)} at street exit.`,
      );
    }
    if (marketTooSoft) {
      headlines.push(
        `Street may be soft: asking median $${askingMedian!.toFixed(2)} is near your all-in $${yourCost.toFixed(2)}.`,
      );
    }
  } else {
    if (cheapestInStock != null && yourCost > 0 && yourCost >= cheapestInStock - 25) {
      headlines.push(
        `New in stock at $${cheapestInStock.toFixed(2)} — stay more than $25 below new on used.`,
      );
    }
    if (sold.count > 0) {
      const label = modeId === "used-tradein" ? "Max offer" : "Max bid";
      headlines.push(
        `${label} ${usd(result.effectiveMaxHammer)} at P25 sold $${anchorPrice.toFixed(2)} (median $${medianSold.toFixed(2)}).`,
      );
    }
    if (result.profitMaxHammer > result.effectiveMaxHammer + 0.01) {
      headlines.push(
        `New wholesale cap lowered walk-away from $${result.profitMaxHammer.toFixed(2)} to $${result.effectiveMaxHammer.toFixed(2)}.`,
      );
    }
  }

  return {
    modeId,
    mode: legacyMode(modeId),
    wholesaleRows,
    bestAlternate: bestAlternate
      ? {
          vendorName: bestAlternate.vendorName,
          productLabel: bestAlternate.productLabel,
          dealerPrice: bestAlternate.dealerPrice,
          savings: bestAlternate.savingsVsYourCost!,
          inStock: bestAlternate.inStock,
        }
      : null,
    cheapestInStockDealer: cheapestInStockRow
      ? {
          vendorName: cheapestInStockRow.vendorName,
          productLabel: cheapestInStockRow.productLabel,
          dealerPrice: cheapestInStockRow.dealerPrice,
        }
      : null,
    topVendorDeals,
    cheapestInStock,
    lowestAsking,
    medianSold,
    askingMedian,
    marginAtMedian: profitAtAnchor,
    marginPctAtMedian: marginPctAtAnchor,
    marketTooSoft,
    headlines,
  };
}

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function isTrackedDealer(name: string): boolean {
  return TRACKED_DEALERS.includes(name.toLowerCase() as TrackedVendor);
}

export const DEALER_OPTIONS = TRACKED_DEALERS.map((d) => ({
  value: d,
  label: VENDOR_LABELS[d],
}));
