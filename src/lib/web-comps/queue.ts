/**
 * In-process drip queue for web-comps enrich (free-tier safe).
 * Never blocks evaluate/batch — enqueue and return.
 */

import "server-only";

import { webCanonicalKey } from "./aggregate";
import { enrichIdentity, loadWebPriceStats, statsAreFreshHigh } from "./ingest";
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

async function worker() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      rollDay();
      if (processedToday >= maxPerDay()) {
        lastError = `Daily web-comps budget exhausted (${maxPerDay()}/day).`;
        while (queue.length) {
          const item = queue.shift()!;
          queuedKeys.delete(item.key);
          rememberFinished(item.key, "low", 0, false);
        }
        break;
      }

      const item = queue.shift()!;
      queuedKeys.delete(item.key);
      activeKey = item.key;

      try {
        if (!(await statsAreFreshHigh(item.key))) {
          const result = await enrichIdentity(item.identity);
          if (!result.ok) lastError = result.error ?? "enrich failed";
          else lastError = null;
          processedToday += 1;
          rememberFinished(
            item.key,
            result.stats?.confidence ?? "low",
            result.stats?.count ?? 0,
            result.ok,
          );
        } else {
          const stats = await loadWebPriceStats(item.key);
          rememberFinished(item.key, stats?.confidence ?? "high", stats?.count ?? 0, true);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        rememberFinished(item.key, "low", 0, false);
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
  void worker();
  return { queued: true, canonicalKey: key, reason: "enqueued" };
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
