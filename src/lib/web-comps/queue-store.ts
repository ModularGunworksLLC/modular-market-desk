/**
 * SQLite copy of the web-comps drip so a restart does not forget queued rows
 * or hide a daily-limit outcome.
 */

import { db } from "@/lib/db";

import type { WebIdentity } from "./types";

export interface StoredQueueItem {
  key: string;
  identity: WebIdentity;
  status: string;
  detail: string | null;
}

async function ensure(): Promise<void> {
  await db.$client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS web_comps_queue (
      canonical_key TEXT PRIMARY KEY,
      identity_json TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
}

export async function saveQueueItem(item: StoredQueueItem): Promise<void> {
  try {
    await ensure();
    await db.$client.execute({
      sql: `INSERT INTO web_comps_queue (canonical_key, identity_json, status, detail, updated_at)
            VALUES (?, ?, ?, ?, unixepoch())
            ON CONFLICT(canonical_key) DO UPDATE SET
              identity_json = excluded.identity_json,
              status = excluded.status,
              detail = excluded.detail,
              updated_at = unixepoch()`,
      args: [item.key, JSON.stringify(item.identity), item.status, item.detail],
    });
  } catch {
    // The in-memory queue still runs if the file DB is unavailable.
  }
}

export async function loadQueuedItems(): Promise<StoredQueueItem[]> {
  try {
    await ensure();
    const result = await db.$client.execute(
      "SELECT canonical_key, identity_json, status, detail FROM web_comps_queue WHERE status = 'queued'",
    );
    return result.rows.flatMap((row) => {
      try {
        return [
          {
            key: String(row.canonical_key),
            identity: JSON.parse(String(row.identity_json)) as WebIdentity,
            status: String(row.status),
            detail: row.detail == null ? null : String(row.detail),
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
