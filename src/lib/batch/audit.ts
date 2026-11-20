/**
 * Rows persisted with each batch run so a later audit can see the lot, the
 * title, and the current bid exactly as ingested. Valuations alone do not
 * store those.
 */

export interface BatchAuditInput {
  rowNumber: number;
  lot?: string | null;
  lotTitle?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  currentBid?: number | null;
  accessories?: string[] | null;
  flags?: string[] | null;
}

export interface BatchAuditRow {
  rowNumber: number;
  lot: string;
  title: string;
  currentBid: number | null;
  accessories: string[];
  flags: string[];
}

export function auditRowsFromBatch(rows: BatchAuditInput[]): BatchAuditRow[] {
  return rows.map((row) => {
    const title = (row.lotTitle ?? "").trim() || `${row.manufacturer ?? ""} ${row.model ?? ""}`.trim();
    const bid = row.currentBid;
    return {
      rowNumber: row.rowNumber,
      lot: (row.lot ?? "").trim(),
      title,
      currentBid: bid == null || !Number.isFinite(bid) ? null : bid,
      accessories: row.accessories ?? [],
      flags: row.flags ?? [],
    };
  });
}
