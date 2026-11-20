/**
 * SQLite copy of the web-comps drip.
 * Terminal rows (done, failed, weak, no-comps, budget, expired) are not reloaded.
 */

import type { Client, InValue } from "@libsql/client";

import type { WebIdentity } from "./types";
import { cleanupQueueStatus, isResumableQueueStatus, planResume } from "./queue-lifecycle";

export interface StoredQueueItem {
  key: string;
  identity: WebIdentity;
  status: string;
  detail: string | null;
  error: string | null;
  updatedAtSec: number;
  finishedAtSec: number | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS web_comps_queue (
  canonical_key TEXT PRIMARY KEY,
  identity_json TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT
);
CREATE TABLE IF NOT EXISTS web_comps_budget (
  day TEXT PRIMARY KEY,
  processed INTEGER NOT NULL
);
`;

export async function ensureWebCompsQueue(client: Client): Promise<void> {
  await client.executeMultiple(SCHEMA);
  for (const sql of [
    "ALTER TABLE web_comps_queue ADD COLUMN finished_at INTEGER",
    "ALTER TABLE web_comps_queue ADD COLUMN error TEXT",
  ]) {
    try {
      await client.execute(sql);
    } catch {
      // Column already exists on databases created after the first boot.
    }
  }
}

export async function saveQueueItem(
  client: Client,
  item: {
    key: string;
    identity: WebIdentity;
    status: string;
    detail?: string | null;
    error?: string | null;
    finishedAtSec?: number | null;
  },
): Promise<void> {
  await ensureWebCompsQueue(client);
  const finished = item.finishedAtSec ?? null;
  await client.execute({
    sql: `INSERT INTO web_comps_queue
            (canonical_key, identity_json, status, detail, updated_at, finished_at, error)
          VALUES (?, ?, ?, ?, unixepoch(), ?, ?)
          ON CONFLICT(canonical_key) DO UPDATE SET
            identity_json = excluded.identity_json,
            status = excluded.status,
            detail = excluded.detail,
            updated_at = unixepoch(),
            finished_at = excluded.finished_at,
            error = excluded.error`,
    args: [
      item.key,
      JSON.stringify(item.identity),
      item.status,
      item.detail ?? null,
      finished,
      item.error ?? null,
    ] as InValue[],
  });
}

function readItem(row: Record<string, unknown>): StoredQueueItem | null {
  try {
    return {
      key: String(row.canonical_key),
      identity: JSON.parse(String(row.identity_json)) as WebIdentity,
      status: String(row.status),
      detail: row.detail == null ? null : String(row.detail),
      error: row.error == null ? null : String(row.error),
      updatedAtSec: Number(row.updated_at) || 0,
      finishedAtSec: row.finished_at == null ? null : Number(row.finished_at),
    };
  } catch {
    return null;
  }
}

/** Only queued and running rows. Finished work is never returned. */
export async function loadResumableItems(client: Client): Promise<StoredQueueItem[]> {
  await ensureWebCompsQueue(client);
  const result = await client.execute(
    "SELECT canonical_key, identity_json, status, detail, error, updated_at, finished_at FROM web_comps_queue WHERE status IN ('queued', 'running') ORDER BY updated_at ASC",
  );
  return result.rows.flatMap((row) => {
    const item = readItem(row as Record<string, unknown>);
    return item && isResumableQueueStatus(item.status) ? [item] : [];
  });
}

export async function listQueueItems(client: Client): Promise<StoredQueueItem[]> {
  await ensureWebCompsQueue(client);
  const result = await client.execute(
    "SELECT canonical_key, identity_json, status, detail, error, updated_at, finished_at FROM web_comps_queue",
  );
  return result.rows.flatMap((row) => {
    const item = readItem(row as Record<string, unknown>);
    return item ? [item] : [];
  });
}

export async function loadProcessedToday(client: Client, day: string): Promise<number> {
  await ensureWebCompsQueue(client);
  const result = await client.execute({
    sql: "SELECT processed FROM web_comps_budget WHERE day = ?",
    args: [day],
  });
  return Number(result.rows[0]?.processed ?? 0) || 0;
}

export async function saveProcessedToday(client: Client, day: string, processed: number): Promise<void> {
  await ensureWebCompsQueue(client);
  await client.execute({
    sql: `INSERT INTO web_comps_budget (day, processed) VALUES (?, ?)
          ON CONFLICT(day) DO UPDATE SET processed = excluded.processed`,
    args: [day, processed],
  });
}

/**
 * Idempotent. Final web results become done. Rows older than maxAgeSec become
 * expired. Fresh queued rows with no result stay queued.
 */
/** Keep only the rows that still fit today's cap. The rest are labeled and not resumed. */
export async function settleResumeCap(
  client: Client,
  items: StoredQueueItem[],
  processedToday: number,
  maxPerDay: number,
  label: string,
  nowSec: number,
): Promise<StoredQueueItem[]> {
  const plan = planResume(items, processedToday, maxPerDay);
  for (const row of plan.overCap) {
    await saveQueueItem(client, {
      key: row.key,
      identity: row.identity,
      status: "budget",
      detail: label,
      error: label,
      finishedAtSec: nowSec,
    });
  }
  return plan.resume;
}

export async function cleanupResumableItems(
  client: Client,
  opts: {
    nowSec: number;
    maxAgeSec: number;
    hasFinalWebResult: (item: StoredQueueItem) => Promise<boolean> | boolean;
  },
): Promise<number> {
  const rows = await loadResumableItems(client);
  let changed = 0;
  for (const row of rows) {
    const hasFinal = await opts.hasFinalWebResult(row);
    const next = cleanupQueueStatus(
      { status: row.status, updatedAtSec: row.updatedAtSec, hasFinalWebResult: hasFinal },
      opts.nowSec,
      opts.maxAgeSec,
    );
    if (!next) continue;
    await saveQueueItem(client, {
      key: row.key,
      identity: row.identity,
      status: next,
      detail: row.detail,
      error: next === "expired" ? "expired before lookup" : row.error,
      finishedAtSec: opts.nowSec,
    });
    changed += 1;
  }
  return changed;
}
