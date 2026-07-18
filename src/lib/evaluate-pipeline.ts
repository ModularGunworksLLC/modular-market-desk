/**
 * Shared two-avenue evaluation pipeline.
 *
 * Both the single-deal route (`/api/evaluate`) and the batch buy-sheet
 * (`/api/batch`) run through this so the money math, comp resolution, wholesale
 * cross-reference, and persistence stay identical. Pure math still lives in
 * `@/lib/arbitrage/*`; this module only orchestrates I/O.
 */

import "server-only";

import { round2 } from "@/lib/arbitrage/fees";
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
import { loadSoldWindowStats, pickFreshSoldStats } from "@/lib/oa/sold-windows";
import type { EvaluateRequest } from "@/lib/validation";
import { crossReferenceWholesale, type WholesaleGrid } from "@/lib/wholesale";
import {
  applyCoolingCapToSold,
  assessAskSoldDivergence,
  compareOaToWeb,
  webCanonicalKey,
} from "@/lib/web-comps/aggregate";
import { loadWebPriceStats } from "@/lib/web-comps/ingest";
import { enqueueWebEnrich } from "@/lib/web-comps/queue";
import type { WebCompsSummary } from "@/lib/web-comps/types";
import { assessMatchSuspicion } from "@/lib/match-suspicion";
import { classifyLotTitle, lotKindLabel } from "@/lib/auctions/lot-kind";

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
  /** OA / web / insufficient badge payload for the desk UI. */
  webComps: WebCompsSummary;
  /** Identity / OA↔web disparity warnings (advisory). */
  matchWarnings: string[];
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
    salesTaxRate: (body.salesTaxPct ?? 9) / 100,
    sellChannel: body.sellChannel ?? "gunbroker",
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

  // Prefer original auction title when present — parsed make/model often drops "Rifle/Pistol".
  const titleBlob = [body.lotTitle, enriched.manufacturer, enriched.model, enriched.caliber, body.upc]
    .filter(Boolean)
    .join(" ");
  const lotKind = classifyLotTitle(titleBlob, { category: body.category });
  const matchWarnings: string[] = [];

  // Hard gate: ammo / mags / gear never enter OA sold → Max Bid math.
  if (lotKind !== "firearm") {
    const label = lotKindLabel(lotKind);
    sourceStatus.gba = `excluded — title classified as ${label} (not a complete firearm)`;
    matchWarnings.push(
      `Excluded from firearm pricing: title looks like ${label}. Fix the lot title or remove from buy-sheet.`,
    );
    const emptyWeb: WebCompsSummary = {
      source: "insufficient",
      confidence: null,
      count: 0,
      domainCount: 0,
      median: null,
      sampleUrls: [],
      sampleDomains: [],
      note: sourceStatus.gba,
      agreement: null,
      divergence: null,
      enrichPhase: "skipped",
    };
    const wholesale = await crossReferenceWholesale({
      upc: enriched.upc,
      manufacturer: enriched.manufacturer,
      model: enriched.model,
      caliber: enriched.caliber,
      category: body.category,
      targetAcquisitionCost: body.targetAcquisitionCost,
    });
    sourceStatus.wholesale = `${wholesale.firearmMatches.length} firearms (${wholesale.matchMode})`;
    const result = evaluateDeal(input, summarize([]), {
      decisionAnchor: "p25-sold",
      dealerFloor: wholesale.cheapestInStockFirearm,
      workflow: deskMode.workflow,
      wholesaleCheaperExists: wholesale.cheaperThanTarget,
      askingCount: 0,
    });
    const insights = buildDealInsights({
      modeId,
      result,
      sold: summarize([]),
      asking: summarize([]),
      wholesale,
      sourceDealer: body.sourceDealer,
    });
    return {
      deskMode,
      modeId,
      result,
      asking: summarize([]),
      wholesale,
      insights,
      sourceStatus,
      catalogMatch: null,
      soldListings: [],
      askingListings: [],
      compMeta: null,
      webComps: emptyWeb,
      matchWarnings,
      acquisitionMode: deskMode.workflow === "vendor" ? "dealer" : "auction",
    };
  }

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

  // Prefer recent sold windows from the local bank when sample size allows.
  if (sold.count > 0) {
    const leaf =
      body.gba != null
        ? {
            condition: body.gba.condition === "New" ? "NEW" : "USED",
            modelId: body.gba.modelId,
            caliberId: body.gba.caliberId,
          }
        : catalogMatch != null
          ? {
              condition: catalogMatch.conditionParam === "New" ? "NEW" : "USED",
              modelId: catalogMatch.modelId,
              caliberId: catalogMatch.caliberId,
            }
          : null;
    if (leaf) {
      try {
        const windows = await loadSoldWindowStats(leaf);
        const picked = pickFreshSoldStats(windows);
        if (picked.window !== "all" && picked.sold.count >= 5) {
          sold = picked.sold;
          sourceStatus.soldWindow = `${picked.window} sold window n=${picked.sold.count}`;
        }
      } catch {
        /* keep all-time sold */
      }
    }
  }

  // --- Street asks: advisory + Cooling sanity vs OA solds. Never replace solds. ---
  const webIdentity = {
    manufacturer: enriched.manufacturer,
    model: enriched.model,
    caliber: enriched.caliber || undefined,
    upc: enriched.upc || undefined,
    mpn: enriched.mpn || undefined,
    category: body.category,
  };
  const webKey = webCanonicalKey(webIdentity);
  const webStatsRow = await loadWebPriceStats(webKey);

  let webComps: WebCompsSummary = {
    source: "none",
    confidence: null,
    count: 0,
    domainCount: 0,
    median: null,
    sampleUrls: [],
    sampleDomains: [],
    note: "",
    agreement: null,
    divergence: null,
    canonicalKey: webKey,
    enrichPhase: "idle",
  };

  if (webStatsRow && webStatsRow.median != null && webStatsRow.count > 0) {
    webComps.confidence = webStatsRow.confidence;
    webComps.count = webStatsRow.count;
    webComps.domainCount = webStatsRow.domainCount;
    webComps.median = webStatsRow.median;
    webComps.sampleUrls = webStatsRow.sampleUrls ?? [];
    webComps.sampleDomains = webStatsRow.sampleDomains ?? [];
  }

  if (sold.count > 0) {
    webComps.source = "oa";
    webComps.enrichPhase = "oa";
    webComps.note = "OA solds drive money math";
    if (webComps.median != null && webComps.count > 0) {
      webComps.agreement = compareOaToWeb(sold.median, webComps.median);
      webComps.divergence = assessAskSoldDivergence({
        soldAnchor: sold.p25 > 0 ? sold.p25 : sold.median,
        askMedian: webComps.median,
        askCount: webComps.count,
      });
      const webMed = webComps.median.toFixed(0);
      if (webComps.divergence === "cooling") {
        sourceStatus.web = `Cooling — street asks ($${webMed}) under sold FMV; Max Bid capped toward asks`;
        sold = applyCoolingCapToSold(sold, webComps.median);
        webComps.note = sourceStatus.web;
      } else if (webComps.divergence === "asks_rich") {
        sourceStatus.web = `Asks rich (street $${webMed}) — money still uses OA solds`;
        webComps.note = sourceStatus.web;
      } else if (webComps.agreement === "agrees") {
        sourceStatus.web = `Street asks agree (median $${webMed}, ${webComps.domainCount} domains)`;
        webComps.note = sourceStatus.web;
      } else if (webComps.agreement === "web_higher") {
        sourceStatus.web = `Street asks above OA solds ($${webMed}) — money still uses OA`;
        webComps.note = sourceStatus.web;
      } else if (webComps.agreement === "web_lower") {
        sourceStatus.web = `Street asks below OA ($${webMed}) — money still uses OA`;
        webComps.note = sourceStatus.web;
      }
    }
  } else {
    // Asks never become solds — queue enrich / show street-only advisory.
    const enq = await enqueueWebEnrich(webIdentity);
    let enrichPhase: WebCompsSummary["enrichPhase"] = "skipped";
    if (enq.queued || enq.reason === "already_queued") enrichPhase = "queued";
    else if (enq.reason === "already_fresh_high") enrichPhase = "ready";
    else if (webComps.count >= 3) enrichPhase = "weak";
    else enrichPhase = "skipped";

    webComps.source = "insufficient";
    webComps.enrichPhase = enrichPhase;
    webComps.divergence = "thin";
    webComps.note =
      webComps.count > 0
        ? `Street asks only (n=${webComps.count}) — not solds; no OA Max Bid`
        : enq.queued
          ? "No OA solds — queued street-ask enrich"
          : `No OA solds — ${enq.reason.replace(/_/g, " ")}`;
    sourceStatus.web = webComps.note;
  }

  // Suspicious OA identity: lot bid/cost vs OA median, and OA↔web disagreement.
  const suspicion = assessMatchSuspicion({
    bidOrCost: body.targetAcquisitionCost,
    oaMedian: sold.count > 0 ? sold.median : null,
    oaCount: sold.count,
    webMedian: webComps.median,
    webAgreement: webComps.agreement,
  });
  if (suspicion.suspicious) {
    matchWarnings.push(...suspicion.warnings);
    sourceStatus.matchWarning = suspicion.warnings[0] ?? "Suspicious OA match";
    // Queue web enrich for validation when OA looks wrong but we have no web yet.
    if (sold.count > 0 && webComps.source === "oa" && (webComps.confidence == null || webComps.count < 3)) {
      const enq = await enqueueWebEnrich(webIdentity);
      if (enq.queued || enq.reason === "already_queued") {
        matchWarnings.push("Web enrich queued to validate this OA match");
        sourceStatus.web = sourceStatus.web
          ? `${sourceStatus.web} · enrich queued for validation`
          : "enrich queued for validation";
        if (webComps.enrichPhase === "oa") {
          webComps.enrichPhase = "queued";
        }
      }
    }
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
    const money = (n: number) => round2(n);
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
    webComps,
    matchWarnings,
    acquisitionMode: legacyAcquisitionMode,
  };
}
