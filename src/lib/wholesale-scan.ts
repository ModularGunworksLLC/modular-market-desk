/**
 * Scan imported distributor catalogs for in-stock firearms that clear desk profit rules.
 * Uses live GBA comps when an Outdoor Analytics token is available.
 */

import "server-only";

import { and, eq, gt, inArray } from "drizzle-orm";

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";
import { getMarketToken } from "@/lib/connections";
import { db } from "@/lib/db";
import { catalogItems } from "@/lib/db/schema";
import { runEvaluation } from "@/lib/evaluate-pipeline";
import { isTrackedVendor, TRACKED_VENDORS } from "@/lib/tracked-vendors";
import { pickScanCandidates, type ScanCatalogRow } from "@/lib/wholesale-scan-candidates";

export interface ScanOptions {
  /** Tracked vendor slug, or "all" for every imported distributor. */
  vendor?: string;
  /** Max catalog rows to evaluate (GBA calls are slow). */
  limit?: number;
  targetProfit?: number;
  minMarginPct?: number;
  inboundShip?: number;
}

export interface ScanResultRow {
  vendorName: string;
  sku: string | null;
  upc: string | null;
  manufacturer: string;
  model: string;
  productLabel: string;
  caliber: string | null;
  category: string;
  dealerPrice: number;
  inStock: boolean;
  verdict: "GO" | "NO-GO";
  netProfit: number;
  marginPct: number;
  maxBid: number;
  soldMedian: number | null;
  soldCount: number;
  gbaStatus: string;
}

export interface ScanSummary {
  vendor: string;
  scanned: number;
  firearms: number;
  goCount: number;
  rows: ScanResultRow[];
  tokenMissing: boolean;
}

const ALL_VENDORS = "all";
const CATALOG_FETCH_CAP = 40_000;

export async function scanWholesaleDeals(opts: ScanOptions = {}): Promise<ScanSummary> {
  const vendorRaw = (opts.vendor ?? ALL_VENDORS).trim().toLowerCase();
  const scanAll = vendorRaw === ALL_VENDORS || vendorRaw === "";
  if (!scanAll && !isTrackedVendor(vendorRaw)) {
    throw new Error(`Unsupported vendor "${vendorRaw}".`);
  }

  const vendor = scanAll ? ALL_VENDORS : vendorRaw;
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const token = await getMarketToken();

  const vendorFilter = scanAll
    ? inArray(catalogItems.vendorName, [...TRACKED_VENDORS])
    : eq(catalogItems.vendorName, vendor);

  const rows = await db
    .select()
    .from(catalogItems)
    .where(and(vendorFilter, eq(catalogItems.inStock, true), gt(catalogItems.dealerPrice, 0)))
    .limit(CATALOG_FETCH_CAP);

  const mapped: ScanCatalogRow[] = rows.map((r) => ({
    vendorName: r.vendorName,
    sku: r.sku,
    upc: r.upc,
    manufacturer: r.manufacturer,
    model: r.model,
    description: r.description,
    category: r.category,
    caliber: r.caliber,
    dealerPrice: Number(r.dealerPrice),
    inStock: r.inStock,
  }));

  const candidates = pickScanCandidates(mapped, limit);

  const results: ScanResultRow[] = [];

  for (const { r, category } of candidates) {
    const dealerPrice = Number(r.dealerPrice);
    const productLabel = r.description?.trim() || r.model?.trim() || "—";

    if (!token) {
      results.push({
        vendorName: r.vendorName,
        sku: r.sku,
        upc: r.upc,
        manufacturer: r.manufacturer,
        model: r.model,
        productLabel,
        caliber: r.caliber,
        category,
        dealerPrice,
        inStock: r.inStock,
        verdict: "NO-GO",
        netProfit: 0,
        marginPct: 0,
        maxBid: 0,
        soldMedian: null,
        soldCount: 0,
        gbaStatus: "skipped (no OA token)",
      });
      continue;
    }

    try {
      const out = await runEvaluation(
        {
          workflow: "vendor" as const,
          usedSubtype: "auction" as const,
          sourceDealer: r.vendorName,
          manufacturer: r.manufacturer,
          model: r.model || productLabel,
          upc: r.upc ?? "",
          mpn: "",
          caliber: r.caliber ?? "",
          category,
          condition: "new",
          targetAcquisitionCost: dealerPrice,
          inboundShip: opts.inboundShip ?? 0,
          buyerPremiumPct: 0,
          purchaseCardPct: 0,
          listingUpgrades: DEAL_DEFAULTS.listingUpgrades,
          buyerPaysOutboundShip: DEAL_DEFAULTS.buyerPaysOutboundShip,
          buyerPaysCardFee: DEAL_DEFAULTS.buyerPaysCardFee,
          targetProfit: opts.targetProfit ?? DEAL_DEFAULTS.targetProfit,
          minMarginPct: opts.minMarginPct ?? DEAL_DEFAULTS.minMarginPct,
          sellChannel: "gunbroker",
          salesTaxPct: DEAL_DEFAULTS.salesTaxPct,
          autoComps: true,
        },
        { persist: false, token },
      );

      results.push({
        vendorName: r.vendorName,
        sku: r.sku,
        upc: r.upc,
        manufacturer: r.manufacturer,
        model: r.model,
        productLabel,
        caliber: r.caliber,
        category,
        dealerPrice,
        inStock: r.inStock,
        verdict: out.result.verdict,
        netProfit: out.result.netProfit,
        marginPct: out.result.marginPct,
        maxBid: out.result.maxBid,
        soldMedian: out.soldListings.length > 0 ? out.insights.medianSold : null,
        soldCount: out.soldListings.length,
        gbaStatus: out.sourceStatus.gba ?? "ok",
      });
    } catch (err) {
      results.push({
        vendorName: r.vendorName,
        sku: r.sku,
        upc: r.upc,
        manufacturer: r.manufacturer,
        model: r.model,
        productLabel,
        caliber: r.caliber,
        category,
        dealerPrice,
        inStock: r.inStock,
        verdict: "NO-GO",
        netProfit: 0,
        marginPct: 0,
        maxBid: 0,
        soldMedian: null,
        soldCount: 0,
        gbaStatus: (err as Error).message.slice(0, 120),
      });
    }
  }

  results.sort((a, b) => {
    if (a.verdict !== b.verdict) return a.verdict === "GO" ? -1 : 1;
    return b.netProfit - a.netProfit;
  });

  return {
    vendor,
    scanned: candidates.length,
    firearms: candidates.length,
    goCount: results.filter((r) => r.verdict === "GO").length,
    rows: results,
    tokenMissing: !token,
  };
}
