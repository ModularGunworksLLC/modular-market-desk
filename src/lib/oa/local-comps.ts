/**
 * Read sold/asking comps from the synced OA SQLite cache (no live token required).
 */

import { and, eq } from "drizzle-orm";

import { summarize } from "@/lib/arbitrage/stats";
import type { PriceStats } from "@/lib/arbitrage/types";
import { buildDecisionStats, type CompFilterMeta } from "@/lib/comp-filter";
import type { CompIdentityContext } from "@/lib/comp-identity";
import { db } from "@/lib/db";
import { oaCatalog, oaMarketStats, oaSoldComps } from "@/lib/db/schema";
import type { AskingCompRow, SoldCompRow } from "@/lib/gba/client";
import type { OaSelection } from "@/lib/gba/scorer";
import { ensureOaCatalogTables } from "@/lib/oa/sync-catalog";

export type LocalMarketBundle = {
  sold: PriceStats;
  asking: PriceStats;
  soldRows: SoldCompRow[];
  askingRows: AskingCompRow[];
  compMeta: CompFilterMeta;
  selection: OaSelection;
  source: string;
};

function bucketToParam(condition: "NEW" | "USED"): "New" | "Used" {
  return condition === "NEW" ? "New" : "Used";
}

export async function loadLocalMarket(args: {
  modelId: number;
  caliberId: number;
  condition: "New" | "Used";
  category?: string;
  identity?: CompIdentityContext;
  enrichNotes?: string[];
  manufacturer?: string;
  model?: string;
  caliber?: string;
}): Promise<LocalMarketBundle | null> {
  await ensureOaCatalogTables();
  const conditionKey = args.condition === "New" ? "NEW" : "USED";

  const statsRows = await db
    .select()
    .from(oaMarketStats)
    .where(
      and(
        eq(oaMarketStats.condition, conditionKey),
        eq(oaMarketStats.modelId, args.modelId),
        eq(oaMarketStats.caliberId, args.caliberId),
      ),
    )
    .limit(1);

  let stat = statsRows[0];
  if (!stat) {
    // Fall back to any condition for this model/caliber
    const any = await db
      .select()
      .from(oaMarketStats)
      .where(and(eq(oaMarketStats.modelId, args.modelId), eq(oaMarketStats.caliberId, args.caliberId)))
      .limit(1);
    stat = any[0];
  }
  if (!stat) return null;

  const soldDb = await db
    .select()
    .from(oaSoldComps)
    .where(
      and(
        eq(oaSoldComps.condition, stat.condition),
        eq(oaSoldComps.modelId, args.modelId),
        eq(oaSoldComps.caliberId, args.caliberId),
      ),
    );

  const soldRows: SoldCompRow[] = soldDb.map((r) => ({
    price: r.price,
    salesDate: r.salesDate,
    listingType: r.listingType,
    ...(r.title ? { title: r.title } : {}),
  }));

  const askingSamples = (stat.askingSamples ?? []) as AskingCompRow[];
  const askingRows: AskingCompRow[] = askingSamples.map((a) => ({
    price: Number(a.price),
    title: String(a.title ?? ""),
    condition: String(a.condition ?? ""),
    location: "",
    itemId: a.itemId ?? null,
  }));

  // If sold rows empty but stats have counts, synthesize from samples
  if (soldRows.length === 0 && (stat.soldSamples?.length ?? 0) > 0) {
    for (const s of stat.soldSamples ?? []) {
      soldRows.push({
        price: s.price,
        salesDate: s.salesDate ?? "",
        listingType: s.listingType ?? "",
        ...(s.title ? { title: s.title } : {}),
      });
    }
  }

  const soldRaw = soldRows.map((r) => r.price);
  const askingRaw =
    askingRows.length > 0
      ? askingRows.map((r) => r.price)
      : [
          stat.askingLow,
          stat.askingP25,
          stat.askingMedian,
          stat.askingP75,
          stat.askingHigh,
        ].filter((n): n is number => n != null && n > 0);

  const filtered = buildDecisionStats(soldRaw, askingRaw, soldRows, askingRows, {
    category: args.category,
    identity: args.identity,
    enrichNotes: [...(args.enrichNotes ?? []), "Source: local OA sync cache"],
  });

  // If filter wiped everything but we have stored percentiles, use those
  let sold = filtered.sold;
  let asking = filtered.asking;
  if (sold.count === 0 && (stat.soldCount ?? 0) > 0 && stat.soldP25 != null) {
    sold = {
      count: stat.soldCount,
      low: stat.soldLow ?? stat.soldP25,
      p25: stat.soldP25,
      median: stat.soldMedian ?? stat.soldP25,
      p75: stat.soldP75 ?? stat.soldMedian ?? stat.soldP25,
      high: stat.soldHigh ?? stat.soldP75 ?? stat.soldP25,
      avg: stat.soldAvg ?? stat.soldMedian ?? stat.soldP25,
    };
  }
  if (asking.count === 0 && (stat.askingCount ?? 0) > 0 && stat.askingMedian != null) {
    asking = {
      count: stat.askingCount,
      low: stat.askingLow ?? stat.askingMedian,
      p25: stat.askingP25 ?? stat.askingMedian,
      median: stat.askingMedian,
      p75: stat.askingP75 ?? stat.askingMedian,
      high: stat.askingHigh ?? stat.askingMedian,
      avg: stat.askingAvg ?? stat.askingMedian,
    };
  }

  const catHint = await db
    .select()
    .from(oaCatalog)
    .where(
      and(
        eq(oaCatalog.condition, stat.condition),
        eq(oaCatalog.modelId, args.modelId),
        eq(oaCatalog.caliberId, args.caliberId),
      ),
    )
    .limit(1);

  const manufacturer = args.manufacturer || catHint[0]?.manufacturer || stat.manufacturer;
  const model = args.model || catHint[0]?.model || stat.model;
  const caliber = args.caliber || catHint[0]?.caliber || stat.caliber;

  const selection: OaSelection = {
    conditionKey: stat.condition as "NEW" | "USED",
    conditionParam: bucketToParam(stat.condition as "NEW" | "USED"),
    manufacturerId: stat.manufacturerId,
    manufacturer,
    modelId: stat.modelId,
    model,
    caliberId: stat.caliberId,
    caliber,
    score: 100,
  };

  return {
    sold,
    asking,
    soldRows: filtered.soldDisplay.length ? filtered.soldDisplay : soldRows,
    askingRows: filtered.askingDisplay.length ? filtered.askingDisplay : askingRows,
    compMeta: {
      ...filtered.meta,
      decisionNote: `Local OA cache (${stat.condition}) · ${sold.count} sold · ${asking.count} asking`,
    },
    selection,
    source: `local cache: ${manufacturer} ${model} ${caliber} (${stat.condition}) — ${sold.count} sold, ${asking.count} asking`,
  };
}

/** Empty summarize helper used when building percentile-only asking. */
export function emptyStats(): PriceStats {
  return summarize([]);
}
