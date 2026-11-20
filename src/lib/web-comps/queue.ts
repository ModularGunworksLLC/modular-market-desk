/**
 * In-process drip queue for web-comps enrich (free-tier safe).
 * Never blocks evaluate/batch — enqueue and return.
 */

import "server-only";

import { db } from "@/lib/db";

import { webCanonicalKey } from "./aggregate";
import { enrichIdentity, loadWebPriceStats, statsAreFreshHigh } from "./ingest";
import {
  isFinalWebCompsNote,
  QUEUE_MAX_AGE_SEC,
  terminalStatusForEnrich,
} from "./queue-lifecycle";
import { webCompsBudgetLabel } from "./queue-policy";
import {
  cleanupResumableItems,
  loadProcessedToday,
  loadResumableItems,
  saveProcessedToday,
  saveQueueItem,
  settleResumeCap,
  type StoredQueueItem,
} from "./queue-store";
import type { WebEnrichKeyStatus, WebEnrichPhase, WebIdentity } from "./types";

type QueueItem = { identity: WebIdentity; key: string };

const queue: QueueItem[] = [];
const queuedKeys = new Set<string>();
let running = false;
let activeKey: string | null = null;
let lastError: string | null = null;
let processedToday = 0;
let dayStamp = dayKey();

/** Recently completed enrich jobs (in-memory; DB is source of truth for stats). */
const recentlyFinished = new Map<
  string,
  { at: number; confidence: string; count: number; ok: boolean }
>();

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dripMs(): number {
  const n = Number(process.env.WEB_COMPS_DRIP_MS ?? 15_000);
  return Number.isFinite(n) && n >= 1000 ? n : 15_000;
}

function maxPerDay(): number {
  const n = Number(process.env.WEB_COMPS_MAX_PER_DAY ?? 50);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

function rollDay() {
  const d = dayKey();
  if (d !== dayStamp) {
    dayStamp = d;
    processedToday = 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rememberFinished(key: string, confidence: string, count: number, ok: boolean) {
  recentlyFinished.set(key, { at: Date.now(), confidence, count, ok });
  // Cap memory
  if (recentlyFinished.size > 200) {
    const oldest = [...recentlyFinished.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) recentlyFinished.delete(oldest[0]);
  }
}

async function persistProcessed(): Promise<void> {
  try {
    await saveProcessedToday(db.$client, dayStamp, processedToday);
  } catch {
    // The in-memory counter still enforces the cap for this process.
  }
}

async function persistTerminal(
  item: QueueItem,
  status: string,
  error: string | null,
): Promise<void> {
  const finished = status !== "queued" && status !== "running";
  try {
    await saveQueueItem(db.$client, {
      key: item.key,
      identity: item.identity,
      status,
      detail: error,
      error,
      finishedAtSec: finished ? Math.floor(Date.now() / 1000) : null,
    });
  } catch {
    // A missing table must not crash the drip. The next boot cleanup covers leftovers.
  }
}

async function worker() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      rollDay();
      if (processedToday >= maxPerDay()) {
        lastError = webCompsBudgetLabel(maxPerDay());
        while (queue.length) {
          const item = queue.shift()!;
          queuedKeys.delete(item.key);
          rememberFinished(item.key, "budget", 0, false);
          await persistTerminal(item, "budget", lastError);
        }
        break;
      }

      const item = queue.shift()!;
      queuedKeys.delete(item.key);
      activeKey = item.key;
      await persistTerminal(item, "running", null).catch(() => undefined);

      try {
        if (!(await statsAreFreshHigh(item.key))) {
          const result = await enrichIdentity(item.identity);
          if (!result.ok) lastError = result.error ?? "enrich failed";
          else lastError = null;
          processedToday += 1;
          await persistProcessed();
          const terminal = terminalStatusForEnrich({
            ok: result.ok,
            error: result.error,
            confidence: result.stats?.confidence,
            count: result.stats?.count,
          });
          rememberFinished(item.key, terminal.status, result.stats?.count ?? 0, result.ok);
          await persistTerminal(item, terminal.status, terminal.error);
        } else {
          const stats = await loadWebPriceStats(item.key);
          rememberFinished(item.key, stats?.confidence ?? "high", stats?.count ?? 0, true);
          await persistTerminal(item, "done", null);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        rememberFinished(item.key, "failed", 0, false);
        await persistTerminal(item, "failed", lastError.slice(0, 300));
      } finally {
        activeKey = null;
      }

      if (queue.length > 0) await sleep(dripMs());
    }
  } finally {
    running = false;
    activeKey = null;
  }
}

export async function enqueueWebEnrich(identity: WebIdentity): Promise<{
  queued: boolean;
  canonicalKey: string;
  reason: string;
}> {
  const key = webCanonicalKey(identity);
  rollDay();

  if (processedToday >= maxPerDay()) {
    rememberFinished(key, "budget", 0, false);
    lastError = webCompsBudgetLabel(maxPerDay());
    return { queued: false, canonicalKey: key, reason: "daily_budget" };
  }
  if (await statsAreFreshHigh(key)) {
    return { queued: false, canonicalKey: key, reason: "already_fresh_high" };
  }
  if (queuedKeys.has(key) || activeKey === key) {
    return { queued: false, canonicalKey: key, reason: "already_queued" };
  }

  queuedKeys.add(key);
  queue.push({ identity, key });
  void saveQueueItem(db.$client, { key, identity, status: "queued", detail: null, finishedAtSec: null }).catch(
    () => undefined,
  );
  void worker();
  return { queued: true, canonicalKey: key, reason: "enqueued" };
}

async function valuationAlreadyFinished(item: StoredQueueItem): Promise<boolean> {
  try {
    const stats = await db.$client.execute({
      sql: "SELECT canonical_key FROM web_price_stats WHERE canonical_key = ? LIMIT 1",
      args: [item.key],
    });
    if (stats.rows.length > 0) return true;
  } catch {
    // Stats table is created on first enrich. A missing table is not a finished lookup.
  }
  try {
    const vals = await db.$client.execute({
      sql: `SELECT source_status FROM valuations
            WHERE lower(manufacturer) = lower(?) AND lower(model) = lower(?)
            ORDER BY created_at DESC LIMIT 8`,
      args: [item.identity.manufacturer, item.identity.model],
    });
    for (const row of vals.rows) {
      const raw = row.source_status;
      let web = "";
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        web = String((parsed as { web?: unknown } | null)?.web ?? "");
      } catch {
        web = String(raw ?? "");
      }
      if (isFinalWebCompsNote(web)) return true;
    }
  } catch {
    // No valuations yet.
  }
  return false;
}

let resumeTask: Promise<void> | null = null;

/** Load unfinished rows once per process. Called from instrumentation on boot. */
export function resumeWebCompsQueue(): Promise<void> {
  if (resumeTask) return resumeTask;
  resumeTask = resumeFromStore().catch((err) => {
    resumeTask = null;
    throw err;
  });
  return resumeTask;
}

async function resumeFromStore(): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  await cleanupResumableItems(db.$client, {
    nowSec,
    maxAgeSec: QUEUE_MAX_AGE_SEC,
    hasFinalWebResult: valuationAlreadyFinished,
  });
  rollDay();
  processedToday = await loadProcessedToday(db.$client, dayStamp);
  const pending = await loadResumableItems(db.$client);
  const fresh = pending.filter((row) => !queuedKeys.has(row.key) && row.key !== activeKey);
  const label = webCompsBudgetLabel(maxPerDay());
  const resume = await settleResumeCap(db.$client, fresh, processedToday, maxPerDay(), label, nowSec);
  if (fresh.length > resume.length) lastError = label;
  for (const row of fresh) {
    if (!resume.some((kept) => kept.key === row.key)) rememberFinished(row.key, "budget", 0, false);
  }
  for (const row of resume) {
    queuedKeys.add(row.key);
    queue.push({ identity: row.identity, key: row.key });
  }
  if (queue.length > 0 && !running) void worker();
}

export function webCompsQueueStatus() {
  rollDay();
  return {
    running,
    activeKey,
    depth: queue.length,
    processedToday,
    maxPerDay: maxPerDay(),
    dripMs: dripMs(),
    lastError,
    tavilyConfigured: Boolean(process.env.TAVILY_API_KEY?.trim()),
  };
}

/** Resolve live enrich phase + DB stats for a list of canonical keys. */
export async function getEnrichStatusesForKeys(
  keys: string[],
): Promise<Record<string, WebEnrichKeyStatus>> {
  const out: Record<string, WebEnrichKeyStatus> = {};
  const unique = [...new Set(keys.filter(Boolean))].slice(0, 200);

  for (const key of unique) {
    let phase: WebEnrichPhase = "idle";
    if (activeKey === key) phase = "running";
    else if (queuedKeys.has(key)) phase = "queued";

    const stats = await loadWebPriceStats(key);
    const finished = recentlyFinished.get(key);

    if (phase === "idle") {
      if (stats?.confidence === "high" && stats.count >= 3) phase = "ready";
      else if (finished) phase = stats && stats.count > 0 ? "weak" : "weak";
      else if (stats && stats.count > 0) phase = stats.confidence === "high" ? "ready" : "weak";
    }

    const updated =
      stats?.updatedAt != null
        ? stats.updatedAt instanceof Date
          ? stats.updatedAt.toISOString()
          : new Date(stats.updatedAt as unknown as number).toISOString()
        : finished
          ? new Date(finished.at).toISOString()
          : null;

    out[key] = {
      phase,
      confidence: stats?.confidence ?? null,
      count: stats?.count ?? 0,
      domainCount: stats?.domainCount ?? 0,
      median: stats?.median ?? null,
      updatedAt: updated,
    };
  }

  return out;
}

/** Run one enrich immediately (API / manual). Still counts toward daily budget. */
export async function enrichNow(identity: WebIdentity) {
  rollDay();
  const key = webCanonicalKey(identity);
  if (processedToday >= maxPerDay()) {
    return {
      ok: false as const,
      canonicalKey: key,
      inserted: 0,
      hits: 0,
      error: `Daily web-comps budget exhausted (${maxPerDay()}/day).`,
      stats: await loadWebPriceStats(key),
    };
  }
  activeKey = key;
  try {
    const result = await enrichIdentity(identity);
    if (result.ok) processedToday += 1;
    rememberFinished(
      key,
      result.stats?.confidence ?? "low",
      result.stats?.count ?? 0,
      result.ok,
    );
    return result;
  } finally {
    activeKey = null;
  }
}
