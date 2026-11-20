/**
 * CSV export of an evaluated batch buy-sheet.
 * Numbers are raw dollars (not $ prefixed) so Excel can sum them.
 */

import type { BatchResultRow } from "@/lib/batch/types";

const HEADERS = [
  "Lot",
  "Item",
  "Current bid (ingested)",
  "Category",
  "Local",
  "GB",
  "Trust",
  "Market median",
  "OA sold P25 (comps, not a bid)",
  "Next hammer",
  "You pay @ next",
  "BP %",
  "Max hammer Local",
  "You pay @ max Local",
  "Max hammer GB",
  "You pay @ max GB",
  "Walk-away hammer",
  "Headroom",
  "Profit Local",
  "Profit GB",
  "Dealer floor",
  "Best dealer",
  "Sold comps",
  "OA match",
  "Notes",
  "Warnings",
  "Error",
] as const;

function csvCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const s = typeof value === "number" ? String(value) : value;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function trustLabel(row: BatchResultRow): string {
  if (row.divergence === "cooling") return "Cooling";
  if (row.divergence === "asks_rich") return "Asks rich";
  if (row.divergence === "ok") return "OK";
  return row.webEnrich?.phase ?? "";
}

function oaMatch(row: BatchResultRow): string {
  const hit = row.oaCatalog;
  if (!hit) return "";
  return `${hit.manufacturer} ${hit.model}${hit.caliber ? ` ${hit.caliber}` : ""} (${hit.condition})`;
}

export function batchResultsToCsv(rows: BatchResultRow[]): string {
  const lines = [
    HEADERS.join(","),
    ...rows.map((r) =>
      [
        csvCell(r.lot),
        csvCell(r.label),
        csvCell(r.currentBid),
        csvCell(r.category),
        csvCell(r.verdictLocal),
        csvCell(r.verdictGb),
        csvCell(trustLabel(r)),
        csvCell(r.estimatedGrossResale ?? r.soldMedian),
        csvCell(r.decisionP25),
        csvCell(r.nextBid),
        csvCell(r.allInAtNext),
        csvCell(r.buyerPremiumPct),
        csvCell(r.maxBidLocal),
        csvCell(r.allInAtMaxLocal),
        csvCell(r.maxBidGb),
        csvCell(r.allInAtMaxGb),
        csvCell(r.walkAwayBid ?? r.walkAway),
        csvCell(r.headroom),
        csvCell(r.netProfitLocal),
        csvCell(r.netProfitGb),
        csvCell(r.dealerFloor),
        csvCell(r.bestDealer),
        csvCell(r.soldCount),
        csvCell(oaMatch(r)),
        csvCell(r.matchNote),
        csvCell(r.matchWarnings.join(" · ") || r.newDealerWarning),
        csvCell(r.error),
      ].join(","),
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** UTF-8 BOM so Excel on Windows opens the file without mojibake. */
export function batchResultsToCsvBlob(rows: BatchResultRow[]): Blob {
  return new Blob(["\uFEFF" + batchResultsToCsv(rows)], { type: "text/csv;charset=utf-8" });
}

export function batchExportFilename(opts?: { goOnly?: boolean; at?: Date }): string {
  const d = opts?.at ?? new Date();
  const ymd = d.toISOString().slice(0, 10);
  return opts?.goOnly ? `desk-batch-go-${ymd}.csv` : `desk-batch-${ymd}.csv`;
}
