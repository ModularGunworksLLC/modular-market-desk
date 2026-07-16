/**
 * Full OA market sync: catalog tree + sold/asking comps for every leaf.
 */

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { connections, oaSyncRuns } from "@/lib/db/schema";
import {
  ensureOaCatalogTables,
  syncOaCatalog,
  type OaCatalogSyncReport,
} from "@/lib/oa/sync-catalog";
import {
  compsCoverageFromDb,
  ensureOaMarketTables,
  syncOaComps,
  type OaCompsProgress,
  type OaCompsSyncResult,
} from "@/lib/oa/sync-comps";
import {
  getActiveOaFullRunId,
  getFullLock,
  isOaFullSyncRunning,
  setActiveOaFullRunId,
  setFullLock,
} from "@/lib/oa/sync-state";
import { decryptSecret, normalizeVaultSecret } from "@/lib/vault";

export type OaFullSyncReport = {
  runId: string;
  status: "ok" | "error" | "running";
  catalog?: OaCatalogSyncReport;
  comps?: OaCompsSyncResult;
  compsProgress?: OaCompsProgress;
  error?: string;
  note: string;
};

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

export { isOaFullSyncRunning, getActiveOaFullRunId };

/** Start/await full sync. Concurrent callers share the same in-flight promise. */
export async function syncOaFull(opts?: {
  token?: string;
  forceComps?: boolean;
  limit?: number;
  concurrency?: number;
  compsOnly?: boolean;
}): Promise<OaFullSyncReport> {
  const existing = getFullLock() as Promise<OaFullSyncReport> | null;
  if (existing) return existing;
  const p = runFull(opts).finally(() => {
    setFullLock(null);
    setActiveOaFullRunId(null);
  });
  setFullLock(p);
  return p;
}

/** Fire-and-forget for HTTP 202; poll status via getOaCatalogStatus. */
export function startOaFullSync(opts?: {
  token?: string;
  forceComps?: boolean;
  limit?: number;
  concurrency?: number;
  compsOnly?: boolean;
}): { started: boolean; runId: string | null; alreadyRunning: boolean } {
  if (getFullLock()) {
    return { started: false, runId: getActiveOaFullRunId(), alreadyRunning: true };
  }
  const runId = randomUUID();
  setActiveOaFullRunId(runId);
  const p = runFull({ ...opts, runId })
    .catch((err) => ({
      runId,
      status: "error" as const,
      error: err instanceof Error ? err.message : String(err),
      note: "Full sync failed",
    }))
    .finally(() => {
      setFullLock(null);
      setActiveOaFullRunId(null);
    });
  setFullLock(p);
  return { started: true, runId, alreadyRunning: false };
}

async function runFull(opts?: {
  token?: string;
  forceComps?: boolean;
  limit?: number;
  concurrency?: number;
  compsOnly?: boolean;
  runId?: string;
}): Promise<OaFullSyncReport> {
  await ensureOaCatalogTables();
  await ensureOaMarketTables();

  const token = opts?.token?.trim() || (await loadOaToken());
  if (!token) {
    throw new Error(
      "No Outdoor Analytics token. Save one on Import → Session Vault (outdoor_analytics / market_api).",
    );
  }

  const runId = opts?.runId ?? randomUUID();
  setActiveOaFullRunId(runId);

  await db.insert(oaSyncRuns).values({
    id: runId,
    kind: "full",
    status: "running",
    startedAt: new Date(),
    meta: { phase: opts?.compsOnly ? "comps" : "catalog" },
  });

  try {
    let catalog: OaCatalogSyncReport | undefined;
    if (!opts?.compsOnly) {
      await db
        .update(oaSyncRuns)
        .set({ meta: { phase: "catalog" } })
        .where(eq(oaSyncRuns.id, runId));
      catalog = await syncOaCatalog({ token, nested: true });
    }

    await db
      .update(oaSyncRuns)
      .set({ meta: { phase: "comps", catalogReport: catalog ?? null } })
      .where(eq(oaSyncRuns.id, runId));

    const comps = await syncOaComps({
      token,
      runId,
      force: opts?.forceComps ?? false,
      limit: opts?.limit,
      concurrency: opts?.concurrency,
      onProgress: async (p) => {
        await db
          .update(oaSyncRuns)
          .set({
            meta: {
              phase: "comps",
              catalogReport: catalog ?? null,
              compsProgress: p,
            },
            rowCount: p.processed,
          })
          .where(eq(oaSyncRuns.id, runId));
      },
    });

    const report: OaFullSyncReport = {
      runId,
      status: "ok",
      catalog,
      comps,
      compsProgress: comps.progress,
      note: "Full sync complete: OA catalog + sold/asking comps for every model×caliber leaf.",
    };

    await db
      .update(oaSyncRuns)
      .set({
        status: "ok",
        finishedAt: new Date(),
        manufacturerCount: catalog?.coverage.manufacturersUnique ?? null,
        modelCount: catalog?.coverage.modelsUnique ?? null,
        rowCount: comps.progress.processed,
        meta: {
          phase: "done",
          report,
          catalogReport: catalog ?? null,
          compsProgress: comps.progress,
        },
      })
      .where(eq(oaSyncRuns.id, runId));

    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(oaSyncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: message.slice(0, 2000),
      })
      .where(eq(oaSyncRuns.id, runId));
    throw err;
  }
}

export { compsCoverageFromDb };
