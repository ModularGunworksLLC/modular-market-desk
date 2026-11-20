/**
 * Persist the sheet that was actually scored: lot, title, raw current bid.
 * A failure here must not stop the batch.
 */

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";

import { auditRowsFromBatch, type BatchAuditInput } from "./audit";

async function ensureBatchAuditTables(): Promise<void> {
  await db.$client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS batch_runs (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      buyer_premium_pct REAL,
      purchase_card_pct REAL,
      target_profit REAL
    );
    CREATE TABLE IF NOT EXISTS batch_run_rows (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      lot TEXT NOT NULL,
      title TEXT NOT NULL,
      current_bid REAL,
      accessories_json TEXT NOT NULL DEFAULT '[]',
      flags_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
}

export async function persistBatchAudit(
  rows: BatchAuditInput[],
  defaults: { buyerPremiumPct?: number; purchaseCardPct?: number; targetProfit?: number },
): Promise<string | null> {
  try {
    await ensureBatchAuditTables();
    const runId = randomUUID();
    const audited = auditRowsFromBatch(rows);
    await db.$client.execute({
      sql: `INSERT INTO batch_runs (id, created_at, buyer_premium_pct, purchase_card_pct, target_profit)
            VALUES (?, unixepoch(), ?, ?, ?)`,
      args: [
        runId,
        defaults.buyerPremiumPct ?? null,
        defaults.purchaseCardPct ?? null,
        defaults.targetProfit ?? null,
      ],
    });
    for (const row of audited) {
      await db.$client.execute({
        sql: `INSERT INTO batch_run_rows
              (id, run_id, row_number, lot, title, current_bid, accessories_json, flags_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          runId,
          row.rowNumber,
          row.lot,
          row.title,
          row.currentBid,
          JSON.stringify(row.accessories),
          JSON.stringify(row.flags),
        ],
      });
    }
    return runId;
  } catch {
    return null;
  }
}
