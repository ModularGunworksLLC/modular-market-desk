/**
 * Shared two-avenue evaluation pipeline.
 *
 * Both the single-deal route (`/api/evaluate`) and the batch buy-sheet
 * (`/api/batch`) run through this so the money math, comp resolution, wholesale
 * cross-reference, and persistence stay identical. Pure math still lives in
 * `@/lib/arbitrage/*`; this module only orchestrates I/O.
 */

import "server-only";

import { evaluateDeal } from "@/lib/arbitrage/evaluate";
import { defaultOutboundShip } from "@/lib/arbitrage/shipping";
import { summarize } from "@/lib/arbitrage/stats";
import type { DealInput, EvaluationResult, PriceStats } from "@/lib/arbitrage/types";
import { canonicalKey } from "@/lib/canonical";
import { enrichEvaluateIdentity } from "@/lib/catalog-enrich";
import type { CompIdentityContext } from "@/lib/comp-identity";
import { filterOutlierPrices, type CompFilterMeta } from "@/lib/comp-filter";
import { deskModeId, resolveDeskMode, type DeskMode } from "@/lib/desk-mode";
import { getMarketToken } from "@/lib/connections";
import { redactSecrets } from "@/lib/vault";
import { db } from "@/lib/db";
import { valuations } from "@/lib/db/schema";
import { buildDealInsights, type DealInsights } from "@/lib/deal-insights";
import { GbaApiClient, GbaApiError, type AskingCompRow, type SoldCompRow } from "@/lib/gba/client";
import type { OaSelection } from "@/lib/gba/scorer";
import { loadLocalMarket } from "@/lib/oa/local-comps";
import { loadDepsAndResolve } from "@/lib/oa/resolve-local";
import type { EvaluateRequest } from "@/lib/validation";
import { crossReferenceWholesale, type WholesaleGrid } from "@/lib/wholesale";

export interface EvaluationOutput {
  deskMode: DeskMode;
  modeId: ReturnType<typeof deskModeId>;
  result: EvaluationResult;
  asking: PriceStats;
  wholesale: WholesaleGrid;
  insights: DealInsights;
  sourceStatus: Record<string, string>;
  catalogMatch: OaSelection | null;
  soldListings: SoldCompRow[];
  askingListings: AskingCompRow[];
  compMeta: CompFilterMeta | null;
  /** @deprecated use deskMode */
  acquisitionMode?: "auction" | "dealer";
}

/** Hard failure that should map to an HTTP status on the single-deal route. */
export class EvaluationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}

export async function runEvaluation(
  body: EvaluateRequest,
  opts?: { persist?: boolean; token?: string | null },
): Promise<EvaluationOutput> {
  const persist = opts?.persist ?? true;
  const enriched = await enrichEvaluateIdentity(body);
  const deskMode = resolveDeskMode(body);
  const modeId = deskModeId(deskMode);

  const buyerPremiumPct =
    deskMode.workflow === "vendor" || deskMode.usedSubtype === "tradein" ? 0 : body.buyerPremiumPct;

  const compCondition =
    deskMode.workflow === "vendor"
      ? "new"
      : deskMode.workflow === "used"
        ? body.condition === "any"
          ? "used"
          : body.condition
        : body.condition;

  const outboundShip = body.outboundShip ?? defaultOutboundShip(body.category);

  const input: DealInput = {
    targetAcquisitionCost: body.targetAcquisitionCost,
    inboundShip: body.inboundShip,
    buyerPremiumPct,
    outboundShip,
    buyerPaysOutboundShip: body.buyerPaysOutboundShip,
    buyerPaysCardFee: body.buyerPaysCardFee,
    listingUpgrades: body.listingUpgrades,
    targetProfit: body.targetProfit,
    minMarginPct: body.minMarginPct,
  };

  const sourceStatus: Record<string, string> = {};
  let catalogMatch: OaSelection | null = null;
  let soldListings: SoldCompRow[] = [];
  let askingListings: AskingCompRow[] = [];
  let compMeta: CompFilterMeta | null = null;
  let sold: PriceStats = summarize([]);
  let asking: PriceStats = summarize([]);

  // Allow callers (batch) to pass a pre-fetched token so we don't decrypt per row.
  const token = opts?.token !== undefined ? opts.token : await getMarketToken();

  const identityCtx: CompIdentityContext = {
    upc: enriched.upc || undefined,
    mpn: enriched.mpn || undefined,
    catalogDescription: enriched.catalogDescription ?? undefined,
    dealerCost: deskMode.workflow === "vendor" ? body.targetAcquisitionCost : undefined,
    newOnlyAsking: deskMode.workflow === "vendor",
    minAskRatioOfCost: deskMode.workflow === "vendor" ? 0.75 : undefined,
  };

  const marketOpts = {
    identity: identityCtx,
    dealerCost: deskMode.workflow === "vendor" ? body.targetAcquisitionCost : undefined,
    workflow: deskMode.workflow,
    enrichNotes: enriched.notes,
  };

  // --- Avenue 1: market comps (local OA cache first, then live API) ---
  if (body.gba) {
    const local = await loadLocalMarket({
      modelId: body.gba.modelId,
      caliberId: body.gba.caliberId,
      condition: body.gba.condition,
      category: body.category,
      identity: identityCtx,
      enrichNotes: enriched.notes,
      manufacturer: enriched.manufacturer,
      model: enriched.model,
      caliber: enriched.caliber,
    });
    if (local && local.sold.count > 0) {
      sold = local.sold;
      asking = local.asking;
      soldListings = local.soldRows;
      askingListings = local.askingRows;
      compMeta = local.compMeta;
      catalogMatch = local.selection;
      sourceStatus.gba = local.source;
    } else if (token) {
      try {
        const market = await new GbaApiClient(token).market({
          ...body.gba,
          category: body.category,
          identity: identityCtx,
          useParentModel: !(identityCtx.upc || identityCtx.mpn),
          enrichNotes: enriched.notes,
        });
        sold = market.sold;
        asking = market.asking;
        soldListings = market.soldRows;
        askingListings = market.askingRows;
        compMeta = market.compMeta;
        sourceStatus.gba = `live OA (${sold.count} sold, ${asking.count} asking)`;
      } catch (err) {
        if (local) {
          sold = local.sold;
          asking = local.asking;
          soldListings = local.soldRows;
          askingListings = local.askingRows;
          compMeta = local.compMeta;
          catalogMatch = local.selection;
          sourceStatus.gba = `${local.source} (live OA failed)`;
        } else {
          const status = err instanceof GbaApiError ? (err.status ?? 502) : 502;
          throw new EvaluationError((err as Error).message, status);
        }
      }
    } else if (local) {
      sold = local.sold;
      asking = local.asking;
      soldListings = local.soldRows;
      askingListings = local.askingRows;
      compMeta = local.compMeta;
      catalogMatch = local.selection;
      sourceStatus.gba = local.source;
    } else {
      throw new EvaluationError(
        "No local comps for that Make/Model/Caliber and no Outdoor Analytics token. Sync OA on Import, or paste a token.",
        409,
      );
    }
  } else {
    let resolved = false;
    if (body.autoComps) {
      // Prefer synced catalog resolve + local comps when available (no token needed).
      try {
        const hit = await loadDepsAndResolve({
          manufacturer: enriched.manufacturer,
          model: enriched.model,
          caliber: enriched.caliber || undefined,
          condition: compCondition,
        });
        if (hit) {
          const local = await loadLocalMarket({
            modelId: hit.modelId,
            caliberId: hit.caliberId,
            condition: hit.conditionParam,
            category: body.category,
            identity: identityCtx,
            enrichNotes: enriched.notes,
            manufacturer: hit.manufacturer,
            model: hit.model,
            caliber: hit.caliber,
          });
          if (local && local.sold.count > 0) {
            sold = local.sold;
            asking = local.asking;
            catalogMatch = hit;
            soldListings = local.soldRows;
            askingListings = local.askingRows;
            compMeta = local.compMeta;
            resolved = true;
            sourceStatus.gba = local.source;
          }
        }
      } catch {
        /* fall through to live OA */
      }

      if (!resolved) {
        if (!token) {
          sourceStatus.gba =
            sourceStatus.gba ||
            "no local comps match — sync OA catalog on Import, or paste a token for live pull";
        } else {
          try {
            const market = await new GbaApiClient(token).resolveMarket(
              {
                manufacturer: enriched.manufacturer,
                model: enriched.model,
                caliber: enriched.caliber || undefined,
                category: body.category,
                mpn: enriched.mpn || undefined,
                condition: compCondition,
              },
              marketOpts,
            );
            if (market) {
              sold = market.sold;
              asking = market.asking;
              catalogMatch = market.selection;
              soldListings = market.soldRows;
              askingListings = market.askingRows;
              compMeta = market.compMeta;
              resolved = true;
              const s = market.selection;
              sourceStatus.gba = `live auto: ${s.manufacturer} ${s.model}${s.caliber ? ` ${s.caliber}` : ""} (${s.conditionParam}, score ${s.score.toFixed(0)}) - ${sold.count} sold, ${asking.count} asking`;
            } else {
              sourceStatus.gba = "no catalog match for this manufacturer/model";
            }
          } catch (err) {
            const reason = redactSecrets(
              err instanceof GbaApiError ? err.message : (err as Error).message,
            );
            sourceStatus.gba = `error: ${reason}`;
          }
        }
      }
    }

    if (!resolved && (body.soldPrices?.length || body.askingPrices?.length)) {
      const soldFilter = filterOutlierPrices(body.soldPrices ?? []);
      sold = summarize(soldFilter.filtered);
      asking = summarize(body.askingPrices ?? []);
      sourceStatus.manual = `manual (${sold.count} sold, ${asking.count} asking)`;
      compMeta = {
        soldRawCount: body.soldPrices?.length ?? 0,
        soldDecisionCount: sold.count,
        soldOutliersRemoved: soldFilter.removed,
        soldNonFirearmRemoved: 0,
        askingRawCount: body.askingPrices?.length ?? 0,
        askingDecisionCount: asking.count,
        askingIncompleteRemoved: 0,
        identityRemovedSold: 0,
        identityRemovedAsking: 0,
        matchTier: "family",
        enrichNotes: enriched.notes,
        decisionNote: "Manual comps with outlier filtering on sold prices.",
      };
    }
  }

  if (compMeta) {
    sourceStatus.comps = compMeta.decisionNote;
  }

  // --- Avenue 2: wholesale cross-reference ---
  const wholesale = await crossReferenceWholesale({
    upc: enriched.upc,
    manufacturer: enriched.manufacturer,
    model: enriched.model,
    caliber: enriched.caliber,
    category: body.category,
    targetAcquisitionCost: body.targetAcquisitionCost,
  });
  const floor = wholesale.cheapestInStockFirearm;
  sourceStatus.wholesale = `${wholesale.firearmMatches.length} firearms (${wholesale.matchMode})${
    floor != null ? ` · new floor $${floor.toFixed(2)}` : ""
  }`;
  if (wholesale.warning) sourceStatus.wholesaleWarning = wholesale.warning;

  const cheapestInStock = wholesale.firearmMatches
    .filter((m) => m.inStock)
    .sort((a, b) => a.dealerPrice - b.dealerPrice)[0];

  const anchorSellPrice =
    deskMode.workflow === "vendor" && asking.count > 0 ? asking.low : undefined;

  const result = evaluateDeal(input, sold, {
    anchorSellPrice,
    decisionAnchor: deskMode.workflow === "vendor" ? "low-asking" : "p25-sold",
    dealerFloor: wholesale.cheapestInStockFirearm,
    workflow: deskMode.workflow,
    wholesaleCheaperExists: wholesale.cheaperThanTarget,
    askingCount: asking.count,
    cheapestWholesaleVendor: cheapestInStock?.vendorName ?? null,
    cheapestWholesalePrice: cheapestInStock?.dealerPrice ?? null,
  });

  const insights = buildDealInsights({
    modeId,
    result,
    sold,
    asking,
    wholesale,
    sourceDealer: body.sourceDealer,
  });

  // --- Persist ---
  if (persist) {
    const key = canonicalKey({
      category: body.category,
      manufacturer: enriched.manufacturer,
      model: enriched.model,
      caliber: enriched.caliber,
      condition: body.condition,
    });
    const money = (n: number) => Math.round(n * 100) / 100;
    await db.insert(valuations).values({
      canonicalKey: key,
      category: body.category,
      manufacturer: enriched.manufacturer,
      model: enriched.model,
      upc: enriched.upc || null,
      mpn: enriched.mpn || null,
      caliber: enriched.caliber || null,
      condition: body.condition,
      targetAcquisitionCost: money(body.targetAcquisitionCost),
      inboundShip: money(body.inboundShip),
      buyerPremiumPct: money(buyerPremiumPct),
      outboundShip: money(outboundShip),
      listingUpgrades: money(body.listingUpgrades),
      targetProfit: money(body.targetProfit),
      minMarginPct: money(body.minMarginPct),
      allInCost: money(result.allInCost),
      soldStats: sold,
      askingStats: asking,
      verdict: result.verdict,
      bestRoute: result.upsideRoute === "gunbroker" ? "gunbroker" : "local_al",
      maxBid: money(result.effectiveMaxHammer),
      netProfit: money(result.netProfit),
      marginPct: money(result.marginPct),
      routeA: result.chosen.routeA,
      routeB: result.chosen.routeB,
      wholesaleGrid: wholesale,
      sourceStatus,
      raw: result,
    });
  }

  const legacyAcquisitionMode =
    deskMode.workflow === "vendor" ? ("dealer" as const) : ("auction" as const);

  return {
    deskMode,
    modeId,
    result,
    asking,
    wholesale,
    insights,
    sourceStatus,
    catalogMatch,
    soldListings,
    askingListings,
    compMeta,
    acquisitionMode: legacyAcquisitionMode,
  };
}
