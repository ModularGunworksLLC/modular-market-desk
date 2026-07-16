/**
 * Sync Outdoor Analytics catalog (every brand/model/caliber from /pricing/dependencies)
 * into local SQLite oa_catalog, with a coverage + add/remove report.
 */

import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { flattenDependencies } from "@/lib/gba/catalog-flatten";
import { GbaApiClient } from "@/lib/gba/client";
import { db } from "@/lib/db";
import { connections, oaCatalog, oaSyncRuns } from "@/lib/db/schema";
import { compsCoverageFromDb, ensureOaMarketTables } from "@/lib/oa/sync-comps";
import {
  getCatalogLock,
  isOaFullSyncRunning,
  setCatalogLock,
} from "@/lib/oa/sync-state";
import { decryptSecret, normalizeVaultSecret } from "@/lib/vault";

const BATCH = 400;
const REPORT_LIST_CAP = 80;

export type OaModelRef = {
  condition: string;
  manufacturer: string;
  model: string;
  manufacturerId: number;
  modelId: number;
};

export type OaCatalogSyncReport = {
  runId: string;
  status: "ok" | "error";
  fetchMs: number;
  coverage: {
    manufacturersNew: number;
    manufacturersUsed: number;
    manufacturersUnique: number;
    modelsNew: number;
    modelsUsed: number;
    modelsUnique: number;
    rows: number;
    rowsNew: number;
    rowsUsed: number;
  };
  diff: {
    brandsAdded: string[];
    brandsRemoved: string[];
    brandsUnchanged: number;
    modelsAdded: OaModelRef[];
    modelsRemoved: OaModelRef[];
    modelsUnchanged: number;
    brandsAddedTotal: number;
    brandsRemovedTotal: number;
    modelsAddedTotal: number;
    modelsRemovedTotal: number;
    truncated: boolean;
  };
  note: string;
  error?: string;
};

export type OaCatalogStatus = {
  ok: boolean;
  hasToken: boolean;
  issues: string[];
  coverage: OaCatalogSyncReport["coverage"] | null;
  lastRun: {
    id: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    rowCount: number | null;
    manufacturerCount: number | null;
    modelCount: number | null;
    error: string | null;
    report: OaCatalogSyncReport | null;
  } | null;
  syncRunning: boolean;
  comps: {
    statsRows: number;
    withSold: number;
    withAsking: number;
    soldCompRows: number;
    lastSyncedAt: Date | null;
    catalogLeaves: number;
    coveragePct: number;
  } | null;
  lastCompsProgress: import("@/lib/oa/sync-comps").OaCompsProgress | null;
  completeness: {
    catalogCompleteForOaApi: boolean;
    explanation: string;
    compsSynced: boolean;
  };
};

/** Vault token for outdoor_analytics (no server-only import — safe for CLI + API). */
async function loadOaToken(): Promise<string | null> {
  const env = process.env.GBA_BEARER_TOKEN?.trim();
  if (env) {
    const t = normalizeVaultSecret(env);
    if (t) return t;
  }
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.vendor, "outdoor_analytics"), eq(connections.kind, "market_api")))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  try {
    return normalizeVaultSecret(decryptSecret(row.secret)) || null;
  } catch {
    return null;
  }
}

function brandKey(condition: string, manufacturerId: number, manufacturer: string): string {
  return `${condition}|${manufacturerId}|${manufacturer}`;
}

function modelKey(condition: string, modelId: number, manufacturer: string, model: string): string {
  return `${condition}|${modelId}|${manufacturer}|${model}`;
}

function parseBrandKey(key: string): { condition: string; manufacturer: string } {
  const [condition, , ...rest] = key.split("|");
  return { condition: condition ?? "", manufacturer: rest.join("|") };
}

function parseModelKey(key: string): OaModelRef {
  const [condition, modelIdStr, manufacturer, ...modelParts] = key.split("|");
  return {
    condition: condition ?? "",
    modelId: Number(modelIdStr) || 0,
    manufacturer: manufacturer ?? "",
    model: modelParts.join("|"),
    manufacturerId: 0,
  };
}

function capList<T>(items: T[], cap = REPORT_LIST_CAP): { items: T[]; truncated: boolean; total: number } {
  return { items: items.slice(0, cap), truncated: items.length > cap, total: items.length };
}

export async function ensureOaCatalogTables(): Promise<void> {
  await db.$client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS oa_catalog (
      id text PRIMARY KEY NOT NULL,
      condition text NOT NULL,
      manufacturer_id integer NOT NULL,
      manufacturer text NOT NULL,
      is_common integer DEFAULT false NOT NULL,
      model_id integer NOT NULL,
      model text NOT NULL,
      caliber_id integer NOT NULL,
      caliber text NOT NULL,
      synced_at integer DEFAULT (unixepoch()) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS oa_catalog_uniq ON oa_catalog (condition, model_id, caliber_id);
    CREATE INDEX IF NOT EXISTS oa_catalog_mfr_idx ON oa_catalog (manufacturer);
    CREATE INDEX IF NOT EXISTS oa_catalog_model_idx ON oa_catalog (manufacturer, model);
    CREATE INDEX IF NOT EXISTS oa_catalog_ids_idx ON oa_catalog (model_id, caliber_id);
    CREATE TABLE IF NOT EXISTS oa_sync_runs (
      id text PRIMARY KEY NOT NULL,
      kind text DEFAULT 'catalog' NOT NULL,
      status text NOT NULL,
      started_at integer DEFAULT (unixepoch()) NOT NULL,
      finished_at integer,
      manufacturer_count integer,
      model_count integer,
      row_count integer,
      error text,
      meta text DEFAULT '{}' NOT NULL
    );
  `);
  await ensureOaMarketTables();
}

async function loadExistingKeys(): Promise<{ brands: Set<string>; models: Set<string> }> {
  const rows = await db
    .select({
      condition: oaCatalog.condition,
      manufacturerId: oaCatalog.manufacturerId,
      manufacturer: oaCatalog.manufacturer,
      modelId: oaCatalog.modelId,
      model: oaCatalog.model,
    })
    .from(oaCatalog);

  const brands = new Set<string>();
  const models = new Set<string>();
  for (const r of rows) {
    brands.add(brandKey(r.condition, r.manufacturerId, r.manufacturer));
    models.add(modelKey(r.condition, r.modelId, r.manufacturer, r.model));
  }
  return { brands, models };
}

async function coverageFromDb(): Promise<OaCatalogSyncReport["coverage"] | null> {
  const total = await db.select({ n: sql<number>`count(*)` }).from(oaCatalog);
  const rows = Number(total[0]?.n ?? 0);
  if (rows === 0) return null;

  const byCond = await db
    .select({
      condition: oaCatalog.condition,
      n: sql<number>`count(*)`,
      mfrs: sql<number>`count(distinct ${oaCatalog.manufacturerId})`,
      models: sql<number>`count(distinct ${oaCatalog.modelId})`,
    })
    .from(oaCatalog)
    .groupBy(oaCatalog.condition);

  let rowsNew = 0;
  let rowsUsed = 0;
  let manufacturersNew = 0;
  let manufacturersUsed = 0;
  let modelsNew = 0;
  let modelsUsed = 0;
  for (const r of byCond) {
    if (r.condition === "NEW") {
      rowsNew = Number(r.n);
      manufacturersNew = Number(r.mfrs);
      modelsNew = Number(r.models);
    } else if (r.condition === "USED") {
      rowsUsed = Number(r.n);
      manufacturersUsed = Number(r.mfrs);
      modelsUsed = Number(r.models);
    }
  }

  const uniq = await db
    .select({
      mfrs: sql<number>`count(distinct ${oaCatalog.manufacturerId})`,
      models: sql<number>`count(distinct ${oaCatalog.modelId})`,
    })
    .from(oaCatalog);

  return {
    manufacturersNew,
    manufacturersUsed,
    manufacturersUnique: Number(uniq[0]?.mfrs ?? 0),
    modelsNew,
    modelsUsed,
    modelsUnique: Number(uniq[0]?.models ?? 0),
    rows,
    rowsNew,
    rowsUsed,
  };
}

export async function getOaCatalogStatus(): Promise<OaCatalogStatus> {
  await ensureOaCatalogTables();
  const issues: string[] = [];
  const token = await loadOaToken();
  if (!token) {
    issues.push(
      "No Outdoor Analytics token. On Import → Session Vault: vendor=outdoor_analytics, kind=market_api, paste your Bearer token.",
    );
  }

  const coverage = await coverageFromDb();
  const compsCov = await compsCoverageFromDb();
  const runs = await db.select().from(oaSyncRuns).orderBy(desc(oaSyncRuns.startedAt)).limit(1);
  const last = runs[0] ?? null;
  const meta = (last?.meta ?? {}) as Record<string, unknown>;
  const report =
    (meta.catalogReport as OaCatalogSyncReport | undefined) ??
    (meta.report as OaCatalogSyncReport | undefined) ??
    null;
  const lastCompsProgress =
    (meta.compsProgress as import("@/lib/oa/sync-comps").OaCompsProgress | undefined) ?? null;

  const catalogLeaves = coverage?.rows ?? 0;
  const coveragePct =
    catalogLeaves > 0 ? Math.round((compsCov.statsRows / catalogLeaves) * 1000) / 10 : 0;

  return {
    ok: issues.length === 0,
    hasToken: Boolean(token),
    issues,
    coverage,
    comps: {
      ...compsCov,
      catalogLeaves,
      coveragePct,
    },
    lastCompsProgress,
    lastRun: last
      ? {
          id: last.id,
          status: last.status,
          startedAt: last.startedAt,
          finishedAt: last.finishedAt,
          rowCount: last.rowCount,
          manufacturerCount: last.manufacturerCount,
          modelCount: last.modelCount,
          error: last.error,
          report,
        }
      : null,
    syncRunning:
      Boolean(getCatalogLock()) || isOaFullSyncRunning() || last?.status === "running",
    completeness: {
      catalogCompleteForOaApi: Boolean(coverage && coverage.rows > 0),
      explanation:
        "Full sync pulls OA’s entire /pricing/dependencies catalog, then sold + asking comps for every model×caliber leaf into oa_market_stats / oa_sold_comps. Guns missing from OA’s API catalog cannot appear. Zero-sold leaves are still recorded (withSold vs zeroSold in the report).",
      compsSynced: compsCov.statsRows > 0 && compsCov.statsRows >= Math.max(1, catalogLeaves * 0.95),
    },
  };
}

export async function syncOaCatalog(opts?: {
  token?: string;
  /** When true, skip outer lock + run row (parent full sync owns the job). */
  nested?: boolean;
}): Promise<OaCatalogSyncReport> {
  if (opts?.nested) return runSync(opts);
  const existing = getCatalogLock() as Promise<OaCatalogSyncReport> | null;
  if (existing) return existing;
  if (isOaFullSyncRunning()) {
    throw new Error("A full OA sync is already running. Wait for it to finish or watch progress on Import.");
  }
  const p = runSync(opts).finally(() => {
    setCatalogLock(null);
  });
  setCatalogLock(p);
  return p;
}

async function runSync(opts?: { token?: string; nested?: boolean }): Promise<OaCatalogSyncReport> {
  await ensureOaCatalogTables();

  const token = opts?.token?.trim() || (await loadOaToken());
  if (!token) {
    throw new Error(
      "No Outdoor Analytics token. Save one on Import → Session Vault (outdoor_analytics / market_api).",
    );
  }

  const runId = randomUUID();
  const startedAt = new Date();
  if (!opts?.nested) {
    await db.insert(oaSyncRuns).values({
      id: runId,
      kind: "catalog",
      status: "running",
      startedAt,
      meta: {},
    });
  }

  try {
    const previous = await loadExistingKeys();
    const api = new GbaApiClient(token);
    const t0 = Date.now();
    const deps = await api.dependencies({ force: true });
    const fetchMs = Date.now() - t0;

    const syncedAt = new Date();
    const rows = flattenDependencies(deps, syncedAt);

    const nextBrands = new Set<string>();
    const nextModels = new Set<string>();
    for (const r of rows) {
      nextBrands.add(brandKey(r.condition, r.manufacturerId, r.manufacturer));
      nextModels.add(modelKey(r.condition, r.modelId, r.manufacturer, r.model));
    }

    const brandsAddedKeys = [...nextBrands].filter((k) => !previous.brands.has(k)).sort();
    const brandsRemovedKeys = [...previous.brands].filter((k) => !nextBrands.has(k)).sort();
    const modelsAddedKeys = [...nextModels].filter((k) => !previous.models.has(k)).sort();
    const modelsRemovedKeys = [...previous.models].filter((k) => !nextModels.has(k)).sort();

    const brandsAddedUnique = [
      ...new Set(
        brandsAddedKeys.map((k) => {
          const { condition, manufacturer } = parseBrandKey(k);
          return `${manufacturer} (${condition})`;
        }),
      ),
    ].sort();
    const brandsRemovedUnique = [
      ...new Set(
        brandsRemovedKeys.map((k) => {
          const { condition, manufacturer } = parseBrandKey(k);
          return `${manufacturer} (${condition})`;
        }),
      ),
    ].sort();

    const modelsAdded = modelsAddedKeys.map(parseModelKey);
    const modelsRemoved = modelsRemovedKeys.map(parseModelKey);
    const modelsAddedCap = capList(modelsAdded);
    const modelsRemovedCap = capList(modelsRemoved);
    const brandsAddedDisp = capList(brandsAddedUnique);
    const brandsRemovedDisp = capList(brandsRemovedUnique);

    await db.delete(oaCatalog);
    for (let i = 0; i < rows.length; i += BATCH) {
      await db.insert(oaCatalog).values(rows.slice(i, i + BATCH));
    }

    const coverage = (await coverageFromDb())!;
    const report: OaCatalogSyncReport = {
      runId,
      status: "ok",
      fetchMs,
      coverage,
      diff: {
        brandsAdded: brandsAddedDisp.items,
        brandsRemoved: brandsRemovedDisp.items,
        brandsUnchanged: [...nextBrands].filter((k) => previous.brands.has(k)).length,
        modelsAdded: modelsAddedCap.items,
        modelsRemoved: modelsRemovedCap.items,
        modelsUnchanged: [...nextModels].filter((k) => previous.models.has(k)).length,
        brandsAddedTotal: brandsAddedUnique.length,
        brandsRemovedTotal: brandsRemovedUnique.length,
        modelsAddedTotal: modelsAdded.length,
        modelsRemovedTotal: modelsRemoved.length,
        truncated:
          brandsAddedDisp.truncated ||
          brandsRemovedDisp.truncated ||
          modelsAddedCap.truncated ||
          modelsRemovedCap.truncated,
      },
      note:
        "Catalog tree refreshed from OA /pricing/dependencies. Use Full sync to pull sold/asking comps for every leaf.",
    };

    if (!opts?.nested) {
      await db
        .update(oaSyncRuns)
        .set({
          status: "ok",
          finishedAt: new Date(),
          manufacturerCount: coverage.manufacturersUnique,
          modelCount: coverage.modelsUnique,
          rowCount: coverage.rows,
          meta: {
            report,
            catalogReport: report,
            source: "pricing/dependencies",
            fetchMs,
            newManufacturersApi: Array.isArray(deps.NEW) ? deps.NEW.length : 0,
            usedManufacturersApi: Array.isArray(deps.USED) ? deps.USED.length : 0,
          },
        })
        .where(eq(oaSyncRuns.id, runId));
    }

    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!opts?.nested) {
      await db
        .update(oaSyncRuns)
        .set({
          status: "error",
          finishedAt: new Date(),
          error: message.slice(0, 2000),
        })
        .where(eq(oaSyncRuns.id, runId));
    }
    throw err;
  }
}
