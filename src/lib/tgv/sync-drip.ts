/**
 * Background drip: OA-gap queue → TGV fetch/parse → local tgv_* tables.
 * Tries brand/model/category URL candidates when the first path 404s or parses empty.
 */

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tgvSyncRuns } from "@/lib/db/tgv-schema";

import { fetchTgvHtml } from "./client";
import { ensureTgvTables } from "./ensure";
import { parseTgvModelHtml } from "./parse";
import { buildOaGapQueue, type TgvGapItem } from "./queue";
import { TGV_ORIGIN, tgvPathCandidates } from "./resolve-url";
import { markTgvModelStatus, upsertTgvPage } from "./store";

export type TgvDripProgress = {
  total: number;
  processed: number;
  ok: number;
  notFound: number;
  blocked: number;
  errors: number;
  current?: string;
};

export type TgvDripReport = {
  runId: string;
  status: "ok" | "error";
  progress: TgvDripProgress;
  seconds: number;
  note: string;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const MAX_CANDIDATES = 6;

async function dripOne(
  item: TgvGapItem,
  opts: { cookie?: string; usePlaywright?: boolean } | undefined,
  progress: TgvDripProgress,
): Promise<void> {
  const candidates = tgvPathCandidates(item.manufacturer, item.model, item.category).slice(
    0,
    MAX_CANDIDATES,
  );

  let lastFail: {
    status: "not_found" | "cf_blocked" | "error";
    error: string;
    path: string;
  } | null = null;

  for (const cand of candidates) {
    const url = `${TGV_ORIGIN}${cand.path}`;
    const fetched = await fetchTgvHtml(url, {
      cookie: opts?.cookie,
      usePlaywright: opts?.usePlaywright,
    });

    if (!fetched.ok) {
      const status =
        fetched.reason === "cf_blocked"
          ? "cf_blocked"
          : fetched.reason === "not_found"
            ? "not_found"
            : "error";
      lastFail = { status, error: fetched.error, path: cand.path };
      // Cloudflare / hard errors — don't burn more candidates
      if (status === "cf_blocked" || status === "error") break;
      continue;
    }

    const parsed = parseTgvModelHtml(fetched.html, { path: cand.path });
    if (
      parsed.privatePartyUsed == null &&
      parsed.privatePartyNew == null &&
      parsed.solds.length === 0
    ) {
      lastFail = { status: "not_found", error: "Parsed page but no TGV values", path: cand.path };
      continue;
    }

    await upsertTgvPage({
      manufacturer: item.manufacturer,
      model: item.model,
      category: cand.category,
      gapReason: item.gapReason,
      parsed: {
        ...parsed,
        soldCount: parsed.soldCount > 0 ? parsed.soldCount : parsed.solds.length,
      },
      tgvPath: cand.path,
    });
    progress.ok += 1;
    return;
  }

  const status = lastFail?.status ?? "not_found";
  if (status === "cf_blocked") progress.blocked += 1;
  else if (status === "not_found") progress.notFound += 1;
  else progress.errors += 1;

  await markTgvModelStatus({
    manufacturer: item.manufacturer,
    model: item.model,
    category: item.category,
    status,
    error: lastFail?.error ?? "No TGV candidate matched",
    gapReason: item.gapReason,
    tgvPath: lastFail?.path ?? item.tgvPath,
  });
}

export async function syncTgvOaGaps(opts?: {
  limit?: number;
  delayMs?: number;
  cookie?: string;
  usePlaywright?: boolean;
  skipOk?: boolean;
}): Promise<TgvDripReport> {
  await ensureTgvTables();
  const runId = randomUUID();
  const started = Date.now();
  const delayMs = opts?.delayMs ?? Number(process.env.TGV_DRIP_DELAY_MS ?? 2500);
  const limit = opts?.limit;
  const skipOk = opts?.skipOk !== false;

  await db.insert(tgvSyncRuns).values({
    id: runId,
    kind: "oa_gaps",
    status: "running",
    meta: { limit: limit ?? null, delayMs },
  });

  const progress: TgvDripProgress = {
    total: 0,
    processed: 0,
    ok: 0,
    notFound: 0,
    blocked: 0,
    errors: 0,
  };

  try {
    let queue = await buildOaGapQueue();
    if (skipOk) {
      const already = await db.$client.execute(
        `SELECT manufacturer, model, category FROM tgv_models WHERE last_status = 'ok'`,
      );
      const okSet = new Set(
        already.rows.map(
          (r) =>
            `${String(r.manufacturer).toUpperCase()}|${String(r.model).toUpperCase()}`,
        ),
      );
      // Skip any category once we have an ok bank row for that make/model
      queue = queue.filter(
        (q) => !okSet.has(`${q.manufacturer.toUpperCase()}|${q.model.toUpperCase()}`),
      );
    }
    if (limit != null && Number.isFinite(limit) && limit > 0) {
      queue = queue.slice(0, limit);
    }
    progress.total = queue.length;

    await db
      .update(tgvSyncRuns)
      .set({ queued: queue.length, meta: { limit: limit ?? null, delayMs, queued: queue.length } })
      .where(eq(tgvSyncRuns.id, runId));

    for (const item of queue) {
      progress.current = `${item.manufacturer} ${item.model}`;
      await dripOne(item, opts, progress);
      progress.processed += 1;
      if (progress.processed % 10 === 0 || progress.processed === progress.total) {
        await db
          .update(tgvSyncRuns)
          .set({
            okCount: progress.ok,
            notFoundCount: progress.notFound,
            blockedCount: progress.blocked,
            errorCount: progress.errors,
            meta: { ...progress },
          })
          .where(eq(tgvSyncRuns.id, runId));
        console.log(
          `> tgv drip ${progress.processed}/${progress.total} ok=${progress.ok} nf=${progress.notFound} cf=${progress.blocked} err=${progress.errors} | ${progress.current}`,
        );
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    const seconds = Math.round((Date.now() - started) / 1000);
    await db
      .update(tgvSyncRuns)
      .set({
        status: "ok",
        finishedAt: new Date(),
        okCount: progress.ok,
        notFoundCount: progress.notFound,
        blockedCount: progress.blocked,
        errorCount: progress.errors,
        meta: { ...progress },
      })
      .where(eq(tgvSyncRuns.id, runId));

    return {
      runId,
      status: "ok",
      progress,
      seconds,
      note: `TGV OA-gap drip finished: ${progress.ok} ok / ${progress.total} queued (${seconds}s)`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(tgvSyncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: message,
        okCount: progress.ok,
        notFoundCount: progress.notFound,
        blockedCount: progress.blocked,
        errorCount: progress.errors,
        meta: { ...progress },
      })
      .where(eq(tgvSyncRuns.id, runId));
    return {
      runId,
      status: "error",
      progress,
      seconds: Math.round((Date.now() - started) / 1000),
      note: "TGV OA-gap drip failed",
      error: message,
    };
  }
}
