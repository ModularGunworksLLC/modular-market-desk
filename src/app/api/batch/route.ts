/**
 * POST /api/batch
 * Evaluate a whole auction sheet at once. Streams NDJSON so the buy-sheet fills in
 * live, runs a small concurrency pool to be polite to the GunBroker Analytics API,
 * and reuses the exact single-deal pipeline for every lot.
 *
 * Request:  { rows: BatchEvalRow[], defaults: {...} }
 * Response: newline-delimited JSON — one `{type:"meta"}`, then `{type:"result"}`
 *           per lot, then a final `{type:"done"}`.
 */

import { z } from "zod";

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";
import { defaultOutboundShip } from "@/lib/arbitrage/shipping";
import {
  computeNextBid,
  normalizeBidIncrements,
  walkAwayLegalBid,
  type BidIncrementBand,
} from "@/lib/auctions/bid-increments";
import { getMarketToken } from "@/lib/connections";
import type { BatchResultRow } from "@/lib/batch/types";
import { runEvaluation } from "@/lib/evaluate-pipeline";
import { GbaApiClient } from "@/lib/gba/client";
import type { EvaluateRequest } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

const CONCURRENCY = 3;

const rowSchema = z.object({
  rowNumber: z.number().int(),
  lot: z.string().default(""),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().optional().default(""),
  category: z.string().optional().default("handgun"),
  upc: z.string().optional().default(""),
  currentBid: z.number().nonnegative().nullable().optional(),
  requiredBid: z.number().nonnegative().nullable().optional(),
  bidIncrementAmount: z.number().positive().nullable().optional(),
  buyerPremiumPct: z.number().min(0).max(100).nullable().optional(),
  /** Per-lot inbound ship override (e.g. handgun 2-day vs rifle ground). */
  inboundShip: z.number().nonnegative().nullable().optional(),
});

const bidIncrementBandSchema = z.object({
  upTo: z.number().positive(),
  increment: z.number().positive(),
});

const batchSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
  defaults: z
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
      bidIncrements: z.array(bidIncrementBandSchema).optional(),
    })
    .default({}),
});

type BatchRowInput = z.infer<typeof rowSchema>;

export async function POST(request: Request): Promise<Response> {
  const json = await request.json().catch(() => null);
  const parsed = batchSchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { rows, defaults } = parsed.data;
  const token = await getMarketToken();

  // Warm the catalog dependency tree once so the concurrency pool doesn't trigger
  // several heavy downloads on a cold cache.
  if (token) {
    try {
      await new GbaApiClient(token).dependencies();
    } catch {
      // Non-fatal: per-row resolution will report its own status.
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "meta", total: rows.length, hasToken: Boolean(token) });

      let next = 0;
      let completed = 0;
      const tally = { go: 0, nogo: 0, noComps: 0, errored: 0 };
      const worker = async () => {
        while (next < rows.length) {
          const idx = next++;
          const row = rows[idx]!;
          const result = await evaluateRow(row, defaults, token);
          completed++;
          if (result.error) tally.errored++;
          else if (result.soldCount === 0) tally.noComps++;
          else if (result.verdict === "GO") tally.go++;
          else tally.nogo++;
          send({ type: "result", completed, row: result });
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker());
      await Promise.all(workers);
      send({
        type: "done",
        completed,
        tally,
        hasToken: Boolean(token),
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

async function evaluateRow(
  row: BatchRowInput,
  defaults: z.infer<typeof batchSchema>["defaults"],
  token: string | null,
): Promise<BatchResultRow> {
  const label = `${row.manufacturer} ${row.model}${row.caliber ? ` ${row.caliber}` : ""}`.trim();
  const schedule: BidIncrementBand[] = normalizeBidIncrements(defaults.bidIncrements);
  const listingHints = {
    requiredBid: row.requiredBid ?? null,
    incrementAmount: row.bidIncrementAmount ?? null,
  };
  const usedListing =
    (listingHints.requiredBid != null && listingHints.requiredBid > 0) ||
    (listingHints.incrementAmount != null && listingHints.incrementAmount > 0);
  const nextBid = computeNextBid(row.currentBid ?? null, schedule, listingHints);

  const base: BatchResultRow = {
    rowNumber: row.rowNumber,
    lot: row.lot,
    label,
    category: row.category,
    currentBid: row.currentBid ?? null,
    nextBid,
    walkAwayBid: null,
    verdict: null,
    maxBid: null,
    walkAway: null,
    netProfit: null,
    localProfit: null,
    soldCount: 0,
    soldP25: null,
    soldMedian: null,
    dealerFloor: null,
    bestDealer: null,
    headroom: null,
    incrementSource: usedListing ? "listing" : "settings",
    matchNote: "",
    matchScore: null,
    oaCatalog: null,
    error: null,
  };

  // Evaluate economics at the NEXT legal hammer — that's the actionable bid.
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
    condition: defaults.condition,
    targetAcquisitionCost: actionHammer,
    inboundShip: row.inboundShip ?? defaults.inboundShip,
    buyerPremiumPct: row.buyerPremiumPct ?? defaults.buyerPremiumPct,
    outboundShip: defaults.outboundShip ?? defaultOutboundShip(row.category),
    buyerPaysOutboundShip: defaults.buyerPaysOutboundShip,
    buyerPaysCardFee: defaults.buyerPaysCardFee,
    listingUpgrades: defaults.listingUpgrades,
    targetProfit: defaults.targetProfit,
    minMarginPct: defaults.minMarginPct,
    sellChannel: "gunbroker",
    salesTaxPct: DEAL_DEFAULTS.salesTaxPct,
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
    // Even if profit at nextBid clears, nextBid must not exceed Max Bid ceiling.
    if (verdict === "GO" && nextBid != null && maxBid != null && nextBid > maxBid + 0.01) {
      verdict = "NO-GO";
    }

    const headroom =
      maxBid != null && nextBid != null ? Math.round((maxBid - nextBid) * 100) / 100 : null;

    return {
      ...base,
      verdict,
      maxBid,
      walkAway,
      walkAwayBid,
      nextBid,
      netProfit: sold.count > 0 ? out.result.netProfit : null,
      localProfit: sold.count > 0 ? out.result.localNetProfit : null,
      soldCount: sold.count,
      soldP25: sold.count > 0 ? sold.p25 : null,
      soldMedian: sold.count > 0 ? sold.median : null,
      dealerFloor,
      bestDealer: out.insights.cheapestInStockDealer?.vendorName ?? null,
      headroom,
      matchNote: out.sourceStatus.gba ?? "no comps",
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
      error: null,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}
