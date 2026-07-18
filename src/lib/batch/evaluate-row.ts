/**
 * Single-lot batch evaluation (shared by /api/batch stream + /api/batch/reeval).
 */

import { z } from "zod";

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";
import { round2 } from "@/lib/arbitrage/fees";
import { defaultOutboundShip } from "@/lib/arbitrage/shipping";
import {
  computeNextBid,
  normalizeBidIncrements,
  walkAwayLegalBid,
} from "@/lib/auctions/bid-increments";
import type { BatchResultRow } from "@/lib/batch/types";
import { runEvaluation } from "@/lib/evaluate-pipeline";
import type { EvaluateRequest } from "@/lib/validation";

export const batchRowSchema = z.object({
  rowNumber: z.number().int(),
  lot: z.string().default(""),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().optional().default(""),
  category: z.string().optional().default("handgun"),
  upc: z.string().optional().default(""),
  /** Full auction title for lot-kind + OA resolve context. */
  lotTitle: z.string().optional().default(""),
  currentBid: z.number().nonnegative().nullable().optional(),
  requiredBid: z.number().nonnegative().nullable().optional(),
  bidIncrementAmount: z.number().positive().nullable().optional(),
  buyerPremiumPct: z.number().min(0).max(100).nullable().optional(),
  inboundShip: z.number().nonnegative().nullable().optional(),
});

export const batchBidIncrementBandSchema = z.object({
  upTo: z.number().positive(),
  increment: z.number().positive(),
});

export const batchDefaultsSchema = z
  .object({
    condition: z.enum(["new", "used", "any"]).optional().default("any"),
    buyerPremiumPct: z.number().min(0).max(100).optional().default(DEAL_DEFAULTS.buyerPremiumPct),
    inboundShip: z.number().nonnegative().optional().default(0),
    outboundShip: z.number().nonnegative().optional(),
    listingUpgrades: z.number().min(0).max(5).optional().default(DEAL_DEFAULTS.listingUpgrades),
    buyerPaysOutboundShip: z.boolean().optional().default(DEAL_DEFAULTS.buyerPaysOutboundShip),
    buyerPaysCardFee: z.boolean().optional().default(DEAL_DEFAULTS.buyerPaysCardFee),
    targetProfit: z.number().nonnegative().optional().default(DEAL_DEFAULTS.targetProfit),
    minMarginPct: z.number().min(0).optional().default(DEAL_DEFAULTS.minMarginPct),
    sellChannel: z.enum(["gunbroker", "local"]).optional().default("local"),
    salesTaxPct: z.number().min(0).max(100).optional().default(DEAL_DEFAULTS.salesTaxPct),
    bidIncrements: z.array(batchBidIncrementBandSchema).optional(),
  })
  .default({});

export type BatchRowInput = z.infer<typeof batchRowSchema>;
export type BatchDefaultsInput = z.infer<typeof batchDefaultsSchema>;

export async function evaluateBatchRow(
  row: BatchRowInput,
  defaults: BatchDefaultsInput,
  token: string | null,
): Promise<BatchResultRow> {
  const label = `${row.manufacturer} ${row.model}${row.caliber ? ` ${row.caliber}` : ""}`.trim();
  const schedule = normalizeBidIncrements(defaults.bidIncrements);
  const listingHints = {
    requiredBid: row.requiredBid ?? null,
    incrementAmount: row.bidIncrementAmount ?? null,
  };
  const usedListing =
    (listingHints.requiredBid != null && listingHints.requiredBid > 0) ||
    (listingHints.incrementAmount != null && listingHints.incrementAmount > 0);
  const nextBid = computeNextBid(row.currentBid ?? null, schedule, listingHints);
  const buyerPremiumPct = row.buyerPremiumPct ?? defaults.buyerPremiumPct;
  const inboundShip = row.inboundShip ?? defaults.inboundShip;
  const sellChannel = defaults.sellChannel ?? "local";

  const allInAtNext =
    nextBid != null
      ? round2(nextBid * (1 + buyerPremiumPct / 100) + inboundShip)
      : null;
  const allInAtCurrent =
    row.currentBid != null
      ? round2(row.currentBid * (1 + buyerPremiumPct / 100) + inboundShip)
      : null;

  const base: BatchResultRow = {
    rowNumber: row.rowNumber,
    lot: row.lot,
    label,
    category: row.category,
    currentBid: row.currentBid ?? null,
    nextBid,
    allInAtNext,
    allInAtCurrent,
    buyerPremiumPct,
    sellChannel,
    walkAwayBid: null,
    verdict: null,
    maxBid: null,
    walkAway: null,
    netProfit: null,
    localProfit: null,
    soldCount: 0,
    soldP25: null,
    soldMedian: null,
    estimatedGrossResale: null,
    grossResaleNote: null,
    decisionP25: null,
    askMedian: null,
    divergence: null,
    dealerFloor: null,
    bestDealer: null,
    headroom: null,
    incrementSource: usedListing ? "listing" : "settings",
    matchNote: "",
    matchScore: null,
    oaCatalog: null,
    webEnrich: null,
    matchWarnings: [],
    error: null,
  };

  const actionHammer = nextBid ?? row.currentBid ?? 0;

  const body: EvaluateRequest = {
    workflow: "used",
    usedSubtype: "auction",
    sourceDealer: "",
    manufacturer: row.manufacturer,
    model: row.model,
    upc: row.upc,
    mpn: "",
    caliber: row.caliber,
    category: row.category,
    lotTitle: row.lotTitle || label,
    condition: defaults.condition,
    targetAcquisitionCost: actionHammer,
    inboundShip,
    buyerPremiumPct,
    outboundShip: defaults.outboundShip ?? defaultOutboundShip(row.category),
    buyerPaysOutboundShip: defaults.buyerPaysOutboundShip,
    buyerPaysCardFee: defaults.buyerPaysCardFee,
    listingUpgrades: defaults.listingUpgrades,
    targetProfit: defaults.targetProfit,
    minMarginPct: defaults.minMarginPct,
    sellChannel,
    salesTaxPct: defaults.salesTaxPct ?? DEAL_DEFAULTS.salesTaxPct,
    autoComps: true,
  };

  try {
    const out = await runEvaluation(body, { persist: true, token });
    const sold = out.result.sold;
    const dealerFloor = out.wholesale.cheapestInStockFirearm;
    const maxBid = sold.count > 0 ? out.result.maxBid : null;
    const walkAway =
      maxBid != null && dealerFloor != null
        ? Math.min(maxBid, dealerFloor)
        : (maxBid ?? dealerFloor);
    const walkAwayBid = walkAwayLegalBid(walkAway, schedule, listingHints);

    let verdict: "GO" | "NO-GO" | null = sold.count > 0 ? out.result.verdict : null;
    if (verdict === "GO" && nextBid != null && maxBid != null && nextBid > maxBid + 0.01) {
      verdict = "NO-GO";
    }

    const headroom =
      maxBid != null && nextBid != null ? Math.round((maxBid - nextBid) * 100) / 100 : null;

    let estimatedGrossResale: number | null = null;
    let grossResaleNote: string | null = null;
    if (sold.count > 0 && sold.median > 0) {
      estimatedGrossResale = Math.round(sold.median * 100) / 100;
      grossResaleNote = `OA sold median · n=${sold.count}`;
      if (
        out.webComps?.median != null &&
        out.webComps.median > 0 &&
        out.webComps.count > 0
      ) {
        const d = out.webComps.domainCount;
        grossResaleNote += ` · street asks ~$${Math.round(out.webComps.median)}${
          d > 0 ? ` (${d} domains)` : ""
        }`;
      }
    }

    const channelProfit =
      sold.count > 0
        ? sellChannel === "local"
          ? out.result.localNetProfit
          : out.result.netProfit
        : null;

    return {
      ...base,
      verdict,
      maxBid,
      walkAway,
      walkAwayBid,
      nextBid,
      netProfit: channelProfit,
      localProfit: sold.count > 0 ? out.result.localNetProfit : null,
      soldCount: sold.count,
      soldP25: sold.count > 0 ? sold.p25 : null,
      soldMedian: sold.count > 0 ? sold.median : null,
      decisionP25: sold.count > 0 ? sold.p25 : null,
      estimatedGrossResale,
      grossResaleNote,
      askMedian: out.webComps?.median ?? null,
      divergence: out.webComps?.divergence ?? null,
      dealerFloor,
      bestDealer: out.insights.cheapestInStockDealer?.vendorName ?? null,
      headroom,
      matchNote:
        [
          out.sourceStatus.gba,
          out.sourceStatus.web,
          out.sourceStatus.matchWarning,
        ]
          .filter(Boolean)
          .join(" · ") || "no comps",
      matchScore: out.catalogMatch?.score ?? null,
      oaCatalog: out.catalogMatch
        ? {
            manufacturer: out.catalogMatch.manufacturer,
            model: out.catalogMatch.model,
            caliber: out.catalogMatch.caliber,
            condition: out.catalogMatch.conditionParam,
            score: out.catalogMatch.score,
          }
        : null,
      webEnrich: out.webComps
        ? {
            phase: out.webComps.enrichPhase ?? "idle",
            canonicalKey: out.webComps.canonicalKey ?? null,
            confidence: out.webComps.confidence,
            count: out.webComps.count,
            domainCount: out.webComps.domainCount,
            median: out.webComps.median,
            agreement: out.webComps.agreement ?? null,
            divergence: out.webComps.divergence ?? null,
          }
        : null,
      matchWarnings: out.matchWarnings ?? [],
      error: null,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}
