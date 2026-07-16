/**
 * Pull sold + asking comps from Outdoor Analytics for every oa_catalog leaf.
 * Runs as part of full sync (or comps-only). Supports resume + progress in oa_sync_runs.
 */

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
// sql used for counts only

import { summarize } from "@/lib/arbitrage/stats";
import { GbaApiClient } from "@/lib/gba/client";
import { db } from "@/lib/db";
import { oaCatalog, oaMarketStats, oaSoldComps, oaSyncRuns } from "@/lib/db/schema";

const DEFAULT_CONCURRENCY = 3;
const SAMPLE_SOLD = 40;
const SAMPLE_ASKING = 20;
const PROGRESS_EVERY = 10;

export type OaCompsProgress = {
  phase: "comps";
  total: number;
  processed: number;
  withSold: number;
  withAsking: number;
  zeroSold: number;
  errors: number;
  skippedFresh: number;
  current?: string;
};

export type OaCompsSyncResult = {
  runId: string;
  status: "ok" | "error";
  progress: OaCompsProgress;
  seconds: number;
  note: string;
  error?: string;
};

export async function ensureOaMarketTables(): Promise<void> {
  await db.$client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS oa_market_stats (
      id text PRIMARY KEY NOT NULL,
      condition text NOT NULL,
      manufacturer_id integer NOT NULL,
      manufacturer text NOT NULL,
      model_id integer NOT NULL,
      model text NOT NULL,
      caliber_id integer NOT NULL,
      caliber text NOT NULL,
      sold_count integer DEFAULT 0 NOT NULL,
      sold_low real,
      sold_p25 real,
      sold_median real,
      sold_p75 real,
      sold_high real,
      sold_avg real,
      asking_count integer DEFAULT 0 NOT NULL,
      asking_low real,
      asking_p25 real,
      asking_median real,
      asking_p75 real,
      asking_high real,
      asking_avg real,
      sold_samples text DEFAULT '[]' NOT NULL,
      asking_samples text DEFAULT '[]' NOT NULL,
      last_error text,
      synced_at integer DEFAULT (unixepoch()) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS oa_market_stats_uniq
      ON oa_market_stats (condition, model_id, caliber_id);
    CREATE INDEX IF NOT EXISTS oa_market_stats_mfr_idx ON oa_market_stats (manufacturer);
    CREATE INDEX IF NOT EXISTS oa_market_stats_sold_idx ON oa_market_stats (sold_count);

    CREATE TABLE IF NOT EXISTS oa_sold_comps (
      id text PRIMARY KEY NOT NULL,
      condition text NOT NULL,
      model_id integer NOT NULL,
      caliber_id integer NOT NULL,
      price real NOT NULL,
      sales_date text DEFAULT '' NOT NULL,
      listing_type text DEFAULT '' NOT NULL,
      title text DEFAULT '' NOT NULL,
      synced_at integer DEFAULT (unixepoch()) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS oa_sold_comps_leaf_idx
      ON oa_sold_comps (condition, model_id, caliber_id);
    CREATE INDEX IF NOT EXISTS oa_sold_comps_price_idx ON oa_sold_comps (price);
  `);
}

function conditionParam(bucket: string): "New" | "Used" {
  return bucket.toUpperCase() === "NEW" ? "New" : "Used";
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => runner()));
  return results;
}

export async function compsCoverageFromDb(): Promise<{
  statsRows: number;
  withSold: number;
  withAsking: number;
  soldCompRows: number;
  lastSyncedAt: Date | null;
}> {
  await ensureOaMarketTables();
  const stats = await db
    .select({
      n: sql<number>`count(*)`,
      withSold: sql<number>`sum(case when ${oaMarketStats.soldCount} > 0 then 1 else 0 end)`,
      withAsking: sql<number>`sum(case when ${oaMarketStats.askingCount} > 0 then 1 else 0 end)`,
      last: sql<number>`max(${oaMarketStats.syncedAt})`,
    })
    .from(oaMarketStats);
  const sold = await db.select({ n: sql<number>`count(*)` }).from(oaSoldComps);
  const lastUnix = Number(stats[0]?.last ?? 0);
  return {
    statsRows: Number(stats[0]?.n ?? 0),
    withSold: Number(stats[0]?.withSold ?? 0),
    withAsking: Number(stats[0]?.withAsking ?? 0),
    soldCompRows: Number(sold[0]?.n ?? 0),
    lastSyncedAt: lastUnix > 0 ? new Date(lastUnix * (lastUnix < 1e12 ? 1000 : 1)) : null,
  };
}

type CatalogLeaf = {
  condition: string;
  manufacturerId: number;
  manufacturer: string;
  modelId: number;
  model: string;
  caliberId: number;
  caliber: string;
};

export async function syncOaComps(opts: {
  token: string;
  runId?: string;
  force?: boolean;
  /** Skip leaves synced within this many hours (unless force). */
  freshHours?: number;
  concurrency?: number;
  /** Limit leaves processed (smoke tests). */
  limit?: number;
  onProgress?: (p: OaCompsProgress) => void | Promise<void>;
}): Promise<OaCompsSyncResult> {
  await ensureOaMarketTables();
  const runId = opts.runId ?? randomUUID();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const freshHours = opts.freshHours ?? 24 * 6;
  const freshCutoff = Date.now() - freshHours * 3600 * 1000;
  const t0 = Date.now();

  const ownedRun = !opts.runId;
  if (ownedRun) {
    await db.insert(oaSyncRuns).values({
      id: runId,
      kind: "comps",
      status: "running",
      startedAt: new Date(),
      meta: { phase: "comps" },
    });
  }

  const progress: OaCompsProgress = {
    phase: "comps",
    total: 0,
    processed: 0,
    withSold: 0,
    withAsking: 0,
    zeroSold: 0,
    errors: 0,
    skippedFresh: 0,
  };

  try {
    let leaves = (await db
      .select({
        condition: oaCatalog.condition,
        manufacturerId: oaCatalog.manufacturerId,
        manufacturer: oaCatalog.manufacturer,
        modelId: oaCatalog.modelId,
        model: oaCatalog.model,
        caliberId: oaCatalog.caliberId,
        caliber: oaCatalog.caliber,
      })
      .from(oaCatalog)) as CatalogLeaf[];

    leaves = leaves.filter((l) => l.caliberId > 0);
    if (opts.limit != null && opts.limit > 0) leaves = leaves.slice(0, opts.limit);
    progress.total = leaves.length;

    // Fresh skip map
    const existing = opts.force
      ? []
      : await db
          .select({
            condition: oaMarketStats.condition,
            modelId: oaMarketStats.modelId,
            caliberId: oaMarketStats.caliberId,
            syncedAt: oaMarketStats.syncedAt,
          })
          .from(oaMarketStats);
    const freshKeys = new Set<string>();
    for (const e of existing) {
      const ts = e.syncedAt instanceof Date ? e.syncedAt.getTime() : Number(e.syncedAt) * 1000;
      if (Number.isFinite(ts) && ts >= freshCutoff) {
        freshKeys.add(`${e.condition}|${e.modelId}|${e.caliberId}`);
      }
    }

    const api = new GbaApiClient(opts.token);
    const syncStarted = new Date();

    await mapPool(leaves, concurrency, async (leaf) => {
      const key = `${leaf.condition}|${leaf.modelId}|${leaf.caliberId}`;
      const label = `${leaf.manufacturer} ${leaf.model} ${leaf.caliber} (${leaf.condition})`;

      if (!opts.force && freshKeys.has(key)) {
        progress.skippedFresh++;
        progress.processed++;
        opts.onProgress?.(progress);
        return;
      }

      progress.current = label;
      try {
        const cond = conditionParam(leaf.condition);
        const [soldRows, askingRows] = await Promise.all([
          api.pricingDataRows({
            modelId: leaf.modelId,
            caliberId: leaf.caliberId,
            condition: cond,
          }),
          api.activeListingRows({
            modelId: leaf.modelId,
            caliberId: leaf.caliberId,
            useParentModel: true,
          }),
        ]);

        const soldStats = summarize(soldRows.map((r) => r.price));
        const askingStats = summarize(askingRows.map((r) => r.price));

        await db
          .delete(oaSoldComps)
          .where(
            and(
              eq(oaSoldComps.condition, leaf.condition),
              eq(oaSoldComps.modelId, leaf.modelId),
              eq(oaSoldComps.caliberId, leaf.caliberId),
            ),
          );

        if (soldRows.length) {
          const chunk = 200;
          for (let i = 0; i < soldRows.length; i += chunk) {
            const slice = soldRows.slice(i, i + chunk);
            await db.insert(oaSoldComps).values(
              slice.map((r) => ({
                id: randomUUID(),
                condition: leaf.condition,
                modelId: leaf.modelId,
                caliberId: leaf.caliberId,
                price: r.price,
                salesDate: r.salesDate ?? "",
                listingType: r.listingType ?? "",
                title: r.title ?? "",
                syncedAt: syncStarted,
              })),
            );
          }
        }

        const soldSamples = soldRows.slice(0, SAMPLE_SOLD).map((r) => ({
          price: r.price,
          salesDate: r.salesDate ?? "",
          listingType: r.listingType ?? "",
          ...(r.title ? { title: r.title } : {}),
        }));
        const askingSamples = askingRows.slice(0, SAMPLE_ASKING).map((r) => ({
          price: r.price,
          title: r.title,
          condition: r.condition,
          itemId: r.itemId,
        }));

        await db
          .delete(oaMarketStats)
          .where(
            and(
              eq(oaMarketStats.condition, leaf.condition),
              eq(oaMarketStats.modelId, leaf.modelId),
              eq(oaMarketStats.caliberId, leaf.caliberId),
            ),
          );
        await db.insert(oaMarketStats).values({
          id: randomUUID(),
          condition: leaf.condition,
          manufacturerId: leaf.manufacturerId,
          manufacturer: leaf.manufacturer,
          modelId: leaf.modelId,
          model: leaf.model,
          caliberId: leaf.caliberId,
          caliber: leaf.caliber,
          soldCount: soldStats.count,
          soldLow: soldStats.count ? soldStats.low : null,
          soldP25: soldStats.count ? soldStats.p25 : null,
          soldMedian: soldStats.count ? soldStats.median : null,
          soldP75: soldStats.count ? soldStats.p75 : null,
          soldHigh: soldStats.count ? soldStats.high : null,
          soldAvg: soldStats.count ? soldStats.avg : null,
          askingCount: askingStats.count,
          askingLow: askingStats.count ? askingStats.low : null,
          askingP25: askingStats.count ? askingStats.p25 : null,
          askingMedian: askingStats.count ? askingStats.median : null,
          askingP75: askingStats.count ? askingStats.p75 : null,
          askingHigh: askingStats.count ? askingStats.high : null,
          askingAvg: askingStats.count ? askingStats.avg : null,
          soldSamples,
          askingSamples,
          lastError: null,
          syncedAt: syncStarted,
        });

        if (soldStats.count > 0) progress.withSold++;
        else progress.zeroSold++;
        if (askingStats.count > 0) progress.withAsking++;
      } catch (err) {
        progress.errors++;
        const message = err instanceof Error ? err.message : String(err);
        try {
          await db
            .delete(oaMarketStats)
            .where(
              and(
                eq(oaMarketStats.condition, leaf.condition),
                eq(oaMarketStats.modelId, leaf.modelId),
                eq(oaMarketStats.caliberId, leaf.caliberId),
              ),
            );
          await db.insert(oaMarketStats).values({
            id: randomUUID(),
            condition: leaf.condition,
            manufacturerId: leaf.manufacturerId,
            manufacturer: leaf.manufacturer,
            modelId: leaf.modelId,
            model: leaf.model,
            caliberId: leaf.caliberId,
            caliber: leaf.caliber,
            soldCount: 0,
            askingCount: 0,
            soldSamples: [],
            askingSamples: [],
            lastError: message.slice(0, 500),
            syncedAt: syncStarted,
          });
        } catch {
          /* ignore secondary write failure */
        }
      }

      progress.processed++;
      if (progress.processed % PROGRESS_EVERY === 0 || progress.processed === progress.total) {
        await opts.onProgress?.({ ...progress });
        await db
          .update(oaSyncRuns)
          .set({
            meta: {
              phase: "comps",
              compsProgress: { ...progress },
            },
            rowCount: progress.processed,
          })
          .where(eq(oaSyncRuns.id, runId));
      }
    });

    const seconds = Math.round((Date.now() - t0) / 1000);
    const result: OaCompsSyncResult = {
      runId,
      status: "ok",
      progress,
      seconds,
      note: "Sold rows stored in oa_sold_comps; percentiles + samples in oa_market_stats for every catalog leaf.",
    };

    if (ownedRun) {
      await db
        .update(oaSyncRuns)
        .set({
          status: "ok",
          finishedAt: new Date(),
          rowCount: progress.processed,
          meta: { phase: "comps", compsProgress: progress, result },
        })
        .where(eq(oaSyncRuns.id, runId));
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (ownedRun) {
      await db
        .update(oaSyncRuns)
        .set({
          status: "error",
          finishedAt: new Date(),
          error: message.slice(0, 2000),
          meta: { phase: "comps", compsProgress: progress },
        })
        .where(eq(oaSyncRuns.id, runId));
    }
    throw err;
  }
}
