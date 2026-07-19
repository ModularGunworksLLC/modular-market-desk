/**
 * Cross-leaf Markets aggregates from OA sold comps + catalog.
 * Cached in-process (~10 min). No live Outdoor Analytics calls.
 */

import "server-only";

import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { oaCatalog, oaSyncRuns } from "@/lib/db/schema";
import { ensureOaCatalogTables } from "@/lib/oa/sync-catalog";

import { inferMarketCategory } from "./category";
import type {
  MarketsCategoryFilter,
  MarketsConditionFilter,
  MarketsSummary,
  NameCount,
} from "./types";

export type {
  MarketsCategoryFilter,
  MarketsConditionFilter,
  MarketsSummary,
  NameCount,
} from "./types";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const CACHE_TTL_MS = 10 * 60 * 1000;
const TOP_N = 15;

type CacheEntry = { at: number; summary: MarketsSummary };

declare global {
  // eslint-disable-next-line no-var
  var __marketsSummaryCache: Map<string, CacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __marketsSummaryLock: Promise<unknown> | undefined;
}

const summaryCache = globalThis.__marketsSummaryCache ?? new Map<string, CacheEntry>();
globalThis.__marketsSummaryCache = summaryCache;

/** Serialize TEMP-table fills — shared libsql client must not interleave leaf filters. */
function withSummaryLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalThis.__marketsSummaryLock ?? Promise.resolve();
  const run = prev.then(fn, fn);
  globalThis.__marketsSummaryLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function cacheKey(condition: MarketsConditionFilter, category: MarketsCategoryFilter): string {
  return `${condition}|${category}`;
}

type LeafRow = {
  condition: string;
  modelId: number;
  caliberId: number;
};

async function matchingLeaves(
  condition: MarketsConditionFilter,
  category: MarketsCategoryFilter,
): Promise<{ leaves: LeafRow[]; leafCount: number }> {
  const rows = await db
    .select({
      condition: oaCatalog.condition,
      modelId: oaCatalog.modelId,
      caliberId: oaCatalog.caliberId,
      model: oaCatalog.model,
      caliber: oaCatalog.caliber,
    })
    .from(oaCatalog);

  const leaves: LeafRow[] = [];

  for (const row of rows) {
    const cond = String(row.condition ?? "").toUpperCase();
    if (condition !== "ANY" && cond !== condition) continue;
    if (category !== "all") {
      if (inferMarketCategory(row.model, row.caliber) !== category) continue;
    }
    leaves.push({ condition: cond, modelId: row.modelId, caliberId: row.caliberId });
  }

  return { leaves, leafCount: leaves.length };
}

async function fillLeafFilter(leaves: LeafRow[]): Promise<void> {
  await db.$client.execute(`
    CREATE TEMP TABLE IF NOT EXISTS _markets_leaf_filter (
      condition TEXT NOT NULL,
      model_id INTEGER NOT NULL,
      caliber_id INTEGER NOT NULL,
      PRIMARY KEY (condition, model_id, caliber_id)
    )
  `);
  await db.$client.execute("DELETE FROM _markets_leaf_filter");

  const batchSize = 400;
  for (let i = 0; i < leaves.length; i += batchSize) {
    const batch = leaves.slice(i, i + batchSize);
    if (batch.length === 0) continue;
    const placeholders = batch.map(() => "(?, ?, ?)").join(", ");
    const args: Array<string | number> = [];
    for (const leaf of batch) {
      args.push(leaf.condition, leaf.modelId, leaf.caliberId);
    }
    await db.$client.execute({
      sql: `INSERT OR IGNORE INTO _markets_leaf_filter (condition, model_id, caliber_id) VALUES ${placeholders}`,
      args,
    });
  }
}

function emptySeasonality(): MarketsSummary["seasonality"] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: MONTH_LABELS[i]!,
    count: 0,
  }));
}

function mapNameCounts(rows: Array<Record<string, unknown>>, nameKey: string): NameCount[] {
  return rows
    .map((r) => ({
      name: String(r[nameKey] ?? "Unknown").trim() || "Unknown",
      count: Number(r.n ?? 0),
    }))
    .filter((r) => r.count > 0);
}

async function computeSummary(
  condition: MarketsConditionFilter,
  category: MarketsCategoryFilter,
): Promise<MarketsSummary> {
  await ensureOaCatalogTables();

  const [{ leaves, leafCount }, lastSync] = await Promise.all([
    matchingLeaves(condition, category),
    db.select().from(oaSyncRuns).orderBy(desc(oaSyncRuns.startedAt)).limit(1).then((r) => r[0] ?? null),
  ]);

  await fillLeafFilter(leaves);

  const nowIso = new Date().toISOString();
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const seasonality = emptySeasonality();

  if (leaves.length === 0) {
    const lastSyncAt = lastSync?.finishedAt ?? lastSync?.startedAt ?? null;
    return {
      generatedAt: nowIso,
      cacheTtlSec: Math.round(CACHE_TTL_MS / 1000),
      condition,
      category,
      coverage: {
        leafCount,
        leavesWithSolds: 0,
        leavesWith30d: 0,
        leavesWith90d: 0,
        pctWith90d: 0,
        soldCompRows: 0,
        lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
        lastSyncKind: lastSync?.kind ?? null,
        lastSyncStatus: lastSync?.status ?? null,
      },
      seasonality,
      topManufacturers90d: [],
      topManufacturersAll: [],
      topCalibers90d: [],
      topCalibersAll: [],
    };
  }

  const [
    seasonRes,
    mfrAllRes,
    mfr90Res,
    calAllRes,
    cal90Res,
    coverageRes,
  ] = await Promise.all([
    db.$client.execute(`
      SELECT CAST(substr(s.sales_date, 6, 2) AS INTEGER) AS month, count(*) AS n
      FROM oa_sold_comps s
      INNER JOIN _markets_leaf_filter f
        ON upper(s.condition) = f.condition
        AND s.model_id = f.model_id
        AND s.caliber_id = f.caliber_id
      WHERE s.price > 0
        AND length(s.sales_date) >= 7
        AND substr(s.sales_date, 5, 1) = '-'
      GROUP BY month
    `),
    db.$client.execute({
      sql: `
        SELECT c.manufacturer AS name, count(*) AS n
        FROM oa_sold_comps s
        INNER JOIN _markets_leaf_filter f
          ON upper(s.condition) = f.condition
          AND s.model_id = f.model_id
          AND s.caliber_id = f.caliber_id
        INNER JOIN oa_catalog c
          ON upper(c.condition) = f.condition
          AND c.model_id = f.model_id
          AND c.caliber_id = f.caliber_id
        WHERE s.price > 0
        GROUP BY c.manufacturer
        ORDER BY n DESC, c.manufacturer ASC
        LIMIT ?
      `,
      args: [TOP_N],
    }),
    db.$client.execute({
      sql: `
        SELECT c.manufacturer AS name, count(*) AS n
        FROM oa_sold_comps s
        INNER JOIN _markets_leaf_filter f
          ON upper(s.condition) = f.condition
          AND s.model_id = f.model_id
          AND s.caliber_id = f.caliber_id
        INNER JOIN oa_catalog c
          ON upper(c.condition) = f.condition
          AND c.model_id = f.model_id
          AND c.caliber_id = f.caliber_id
        WHERE s.price > 0
          AND length(s.sales_date) >= 10
          AND s.sales_date >= ?
        GROUP BY c.manufacturer
        ORDER BY n DESC, c.manufacturer ASC
        LIMIT ?
      `,
      args: [cutoff90, TOP_N],
    }),
    db.$client.execute({
      sql: `
        SELECT c.caliber AS name, count(*) AS n
        FROM oa_sold_comps s
        INNER JOIN _markets_leaf_filter f
          ON upper(s.condition) = f.condition
          AND s.model_id = f.model_id
          AND s.caliber_id = f.caliber_id
        INNER JOIN oa_catalog c
          ON upper(c.condition) = f.condition
          AND c.model_id = f.model_id
          AND c.caliber_id = f.caliber_id
        WHERE s.price > 0
        GROUP BY c.caliber
        ORDER BY n DESC, c.caliber ASC
        LIMIT ?
      `,
      args: [TOP_N],
    }),
    db.$client.execute({
      sql: `
        SELECT c.caliber AS name, count(*) AS n
        FROM oa_sold_comps s
        INNER JOIN _markets_leaf_filter f
          ON upper(s.condition) = f.condition
          AND s.model_id = f.model_id
          AND s.caliber_id = f.caliber_id
        INNER JOIN oa_catalog c
          ON upper(c.condition) = f.condition
          AND c.model_id = f.model_id
          AND c.caliber_id = f.caliber_id
        WHERE s.price > 0
          AND length(s.sales_date) >= 10
          AND s.sales_date >= ?
        GROUP BY c.caliber
        ORDER BY n DESC, c.caliber ASC
        LIMIT ?
      `,
      args: [cutoff90, TOP_N],
    }),
    db.$client.execute({
      sql: `
        SELECT
          (SELECT count(*) FROM oa_sold_comps s
            INNER JOIN _markets_leaf_filter f
              ON upper(s.condition) = f.condition
              AND s.model_id = f.model_id
              AND s.caliber_id = f.caliber_id
            WHERE s.price > 0) AS sold_comp_rows,
          (SELECT count(*) FROM (
            SELECT 1 FROM oa_sold_comps s
            INNER JOIN _markets_leaf_filter f
              ON upper(s.condition) = f.condition
              AND s.model_id = f.model_id
              AND s.caliber_id = f.caliber_id
            WHERE s.price > 0
            GROUP BY f.condition, f.model_id, f.caliber_id
          )) AS leaves_with_solds,
          (SELECT count(*) FROM (
            SELECT 1 FROM oa_sold_comps s
            INNER JOIN _markets_leaf_filter f
              ON upper(s.condition) = f.condition
              AND s.model_id = f.model_id
              AND s.caliber_id = f.caliber_id
            WHERE s.price > 0
              AND length(s.sales_date) >= 10
              AND s.sales_date >= ?
            GROUP BY f.condition, f.model_id, f.caliber_id
          )) AS leaves_30d,
          (SELECT count(*) FROM (
            SELECT 1 FROM oa_sold_comps s
            INNER JOIN _markets_leaf_filter f
              ON upper(s.condition) = f.condition
              AND s.model_id = f.model_id
              AND s.caliber_id = f.caliber_id
            WHERE s.price > 0
              AND length(s.sales_date) >= 10
              AND s.sales_date >= ?
            GROUP BY f.condition, f.model_id, f.caliber_id
          )) AS leaves_90d
      `,
      args: [cutoff30, cutoff90],
    }),
  ]);

  for (const row of seasonRes.rows) {
    const month = Number(row.month);
    const count = Number(row.n ?? 0);
    if (month >= 1 && month <= 12) {
      const slot = seasonality[month - 1];
      if (slot) slot.count = count;
    }
  }

    const cov = (coverageRes.rows[0] ?? {}) as Record<string, unknown>;
    const leavesWithSolds = Number(cov.leaves_with_solds ?? 0);
    const leavesWith30d = Number(cov.leaves_30d ?? 0);
    const leavesWith90d = Number(cov.leaves_90d ?? 0);
    const soldCompRows = Number(cov.sold_comp_rows ?? 0);
  const pctWith90d = leafCount > 0 ? Math.round((leavesWith90d / leafCount) * 1000) / 10 : 0;

  const lastSyncAt = lastSync?.finishedAt ?? lastSync?.startedAt ?? null;

  return {
    generatedAt: nowIso,
    cacheTtlSec: Math.round(CACHE_TTL_MS / 1000),
    condition,
    category,
    coverage: {
      leafCount,
      leavesWithSolds,
      leavesWith30d,
      leavesWith90d,
      pctWith90d,
      soldCompRows,
      lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
      lastSyncKind: lastSync?.kind ?? null,
      lastSyncStatus: lastSync?.status ?? null,
    },
    seasonality,
    topManufacturers90d: mapNameCounts(mfr90Res.rows as Array<Record<string, unknown>>, "name"),
    topManufacturersAll: mapNameCounts(mfrAllRes.rows as Array<Record<string, unknown>>, "name"),
    topCalibers90d: mapNameCounts(cal90Res.rows as Array<Record<string, unknown>>, "name"),
    topCalibersAll: mapNameCounts(calAllRes.rows as Array<Record<string, unknown>>, "name"),
  };
}

export async function getMarketsSummary(
  condition: MarketsConditionFilter = "ANY",
  category: MarketsCategoryFilter = "all",
): Promise<MarketsSummary> {
  const key = cacheKey(condition, category);
  const hit = summaryCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return hit.summary;
  }

  return withSummaryLock(async () => {
    const again = summaryCache.get(key);
    const t = Date.now();
    if (again && t - again.at < CACHE_TTL_MS) {
      return again.summary;
    }
    const summary = await computeSummary(condition, category);
    summaryCache.set(key, { at: t, summary });
    return summary;
  });
}

export function clearMarketsSummaryCache(): void {
  summaryCache.clear();
}
