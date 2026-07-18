/**
 * Weekly Market Sync — fill local SQLite data bank (OA solds + curated street asks).
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { marketSyncRuns, valuations, webPriceObservations } from "@/lib/db/schema";
import { ingestAlGunForum } from "@/lib/market-sync/adapters/algunforum";
import { ingestGunsAlabama } from "@/lib/market-sync/adapters/gunsalabama";
import { ingestCuratedSitesForIdentities } from "@/lib/market-sync/adapters/tavily-sites";
import { ensureMarketDataBankTables } from "@/lib/market-sync/ensure";
import { upsertStreetObservations } from "@/lib/market-sync/upsert-obs";
import { syncOaFull, isOaFullSyncRunning } from "@/lib/oa/sync-full";
import type { WebIdentity } from "@/lib/web-comps/types";

export type MarketSyncStatus = {
  running: boolean;
  activeRunId: string | null;
  lastRun: {
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
    meta: Record<string, unknown>;
  } | null;
  bank: {
    askObservations: number;
    bySource: Record<string, number>;
  };
};

let weeklyLock: Promise<WeeklySyncReport> | null = null;
let activeWeeklyId: string | null = null;

export type WeeklySyncReport = {
  runId: string;
  status: "ok" | "error" | "running";
  oa?: { started: boolean; alreadyRunning?: boolean; note?: string; error?: string };
  gunsalabama?: { count: number; note: string };
  algunforum?: { count: number; note: string };
  curated?: { count: number; note: string; errors: string[] };
  pruned?: number;
  error?: string;
  note: string;
};

export function isWeeklyMarketSyncRunning(): boolean {
  return weeklyLock != null;
}

export function getActiveWeeklyRunId(): string | null {
  return activeWeeklyId;
}

async function recentWatchIdentities(limit = 40): Promise<WebIdentity[]> {
  const rows = await db
    .select({
      manufacturer: valuations.manufacturer,
      model: valuations.model,
      caliber: valuations.caliber,
      upc: valuations.upc,
      category: valuations.category,
    })
    .from(valuations)
    .orderBy(desc(valuations.createdAt))
    .limit(limit * 2);

  const seen = new Set<string>();
  const out: WebIdentity[] = [];
  for (const r of rows) {
    const key = `${r.manufacturer}|${r.model}|${r.caliber ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      manufacturer: r.manufacturer,
      model: r.model,
      caliber: r.caliber ?? undefined,
      upc: r.upc ?? undefined,
      category: r.category ?? undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function pruneOldAsks(retentionDays = 180): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 24 * 3600;
  const res = await db.$client.execute({
    sql: `DELETE FROM web_price_observations WHERE observed_at < ? AND kind IN ('ask','local_ask','regional_ask')`,
    args: [cutoff],
  });
  return Number(res.rowsAffected ?? 0);
}

export async function getMarketSyncStatus(): Promise<MarketSyncStatus> {
  await ensureMarketDataBankTables();
  const runs = await db
    .select()
    .from(marketSyncRuns)
    .orderBy(desc(marketSyncRuns.startedAt))
    .limit(1);
  const last = runs[0] ?? null;

  const countRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(webPriceObservations);

  const bySource: Record<string, number> = {};
  try {
    const srcRes = await db.$client.execute(
      `SELECT COALESCE(source, 'unknown') AS source, count(*) AS n FROM web_price_observations GROUP BY source`,
    );
    for (const row of srcRes.rows as unknown as Array<{ source: string; n: number }>) {
      bySource[String(row.source)] = Number(row.n);
    }
  } catch {
    /* older DB without source column */
  }

  return {
    running: weeklyLock != null,
    activeRunId: activeWeeklyId,
    lastRun: last
      ? {
          id: last.id,
          status: last.status,
          startedAt: last.startedAt ? new Date(last.startedAt).toISOString() : null,
          finishedAt: last.finishedAt ? new Date(last.finishedAt).toISOString() : null,
          error: last.error,
          meta: (last.meta as Record<string, unknown>) ?? {},
        }
      : null,
    bank: {
      askObservations: Number(countRow[0]?.n ?? 0),
      bySource,
    },
  };
}

export function startWeeklyMarketSync(opts?: {
  skipOa?: boolean;
  forceOa?: boolean;
  skipAsks?: boolean;
}): { started: boolean; runId: string | null; alreadyRunning: boolean } {
  if (weeklyLock) {
    return { started: false, runId: activeWeeklyId, alreadyRunning: true };
  }
  const runId = randomUUID();
  activeWeeklyId = runId;
  const p = runWeekly({ ...opts, runId })
    .catch(async (err) => {
      const report: WeeklySyncReport = {
        runId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        note: "Weekly market sync failed",
      };
      try {
        await db
          .update(marketSyncRuns)
          .set({
            status: "error",
            finishedAt: new Date(),
            error: report.error ?? null,
            meta: report as unknown as Record<string, unknown>,
          })
          .where(eq(marketSyncRuns.id, runId));
      } catch {
        /* ignore */
      }
      return report;
    })
    .finally(() => {
      weeklyLock = null;
      activeWeeklyId = null;
    });
  weeklyLock = p;
  return { started: true, runId, alreadyRunning: false };
}

export async function syncWeeklyMarket(opts?: {
  skipOa?: boolean;
  forceOa?: boolean;
  skipAsks?: boolean;
}): Promise<WeeklySyncReport> {
  if (weeklyLock) return weeklyLock;
  const runId = randomUUID();
  activeWeeklyId = runId;
  const p = runWeekly({ ...opts, runId }).finally(() => {
    weeklyLock = null;
    activeWeeklyId = null;
  });
  weeklyLock = p;
  return p;
}

async function runWeekly(opts?: {
  skipOa?: boolean;
  forceOa?: boolean;
  skipAsks?: boolean;
  runId?: string;
}): Promise<WeeklySyncReport> {
  await ensureMarketDataBankTables();
  const runId = opts?.runId ?? randomUUID();
  activeWeeklyId = runId;

  await db.insert(marketSyncRuns).values({
    id: runId,
    status: "running",
    startedAt: new Date(),
    meta: { phase: "start" },
  });

  const report: WeeklySyncReport = {
    runId,
    status: "running",
    note: "Weekly market sync running",
  };

  try {
    // 1) OA solds into local bank
    if (!opts?.skipOa) {
      await db
        .update(marketSyncRuns)
        .set({ meta: { phase: "oa" } })
        .where(eq(marketSyncRuns.id, runId));

      if (isOaFullSyncRunning()) {
        report.oa = {
          started: false,
          alreadyRunning: true,
          note: "OA sync already running — will use existing bank",
        };
      } else {
        try {
          const oaReport = await syncOaFull({ forceComps: opts?.forceOa ?? false });
          report.oa = {
            started: true,
            note: oaReport.note || oaReport.status,
            error: oaReport.error,
          };
        } catch (e) {
          report.oa = {
            started: false,
            error: e instanceof Error ? e.message : String(e),
            note: "OA sync failed — continuing with ask sources",
          };
        }
      }
    } else {
      report.oa = { started: false, note: "OA skipped" };
    }

    // 2) Local AL street asks
    if (!opts?.skipAsks) {
      await db
        .update(marketSyncRuns)
        .set({ meta: { phase: "local_asks", oa: report.oa ?? null } })
        .where(eq(marketSyncRuns.id, runId));

      const ga = await ingestGunsAlabama({ maxPages: 3 });
      const gaUpsert = await upsertStreetObservations(ga.observations);
      report.gunsalabama = { count: gaUpsert.insertedOrTouched, note: ga.note };

      const afg = await ingestAlGunForum();
      const afgUpsert = await upsertStreetObservations(afg.observations);
      report.algunforum = { count: afgUpsert.insertedOrTouched, note: afg.note };

      // 3) Curated national/regional via Tavily for recent desk identities
      await db
        .update(marketSyncRuns)
        .set({
          meta: {
            phase: "curated_asks",
            gunsalabama: report.gunsalabama,
            algunforum: report.algunforum,
          },
        })
        .where(eq(marketSyncRuns.id, runId));

      const identities = await recentWatchIdentities(30);
      const curated = await ingestCuratedSitesForIdentities(identities, {
        maxPerIdentity: 2,
        delayMs: 1200,
      });
      report.curated = {
        count: curated.observations,
        note: curated.note,
        errors: curated.errors.slice(0, 5),
      };
    }

    // 4) Prune
    report.pruned = await pruneOldAsks(180);

    report.status = "ok";
    report.note = "Weekly market sync complete — evaluate/Batch read SQLite first";

    await db
      .update(marketSyncRuns)
      .set({
        status: "ok",
        finishedAt: new Date(),
        meta: report as unknown as Record<string, unknown>,
      })
      .where(eq(marketSyncRuns.id, runId));

    return report;
  } catch (e) {
    report.status = "error";
    report.error = e instanceof Error ? e.message : String(e);
    report.note = "Weekly market sync failed";
    await db
      .update(marketSyncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: report.error,
        meta: report as unknown as Record<string, unknown>,
      })
      .where(eq(marketSyncRuns.id, runId));
    return report;
  }
}
