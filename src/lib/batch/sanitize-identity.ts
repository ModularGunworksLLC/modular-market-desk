/**
 * Server-side auction title cleanup before OA resolve.
 * Keeps batch matching correct even when a stale browser bundle still
 * sends TRANS / 308CAL / 10-22 junk in manufacturer/model.
 *
 * IMPORTANT: import parse via a namespace object so Next/SWC does not inline
 * parseTitleBlob into this module (inlining caused a minifier TDZ bug where
 * sanitize silently failed and left TRANS titles unmatched).
 */

import * as titleParse from "@/lib/batch/parse";

export type BatchIdentityFields = {
  manufacturer: string;
  model: string;
  caliber?: string;
  category?: string;
  lotTitle?: string;
};

/** Pearce / HiBid junk that blocks OA resolve if it survives in make/model. */
export function auctionTitleLooksDirty(text: string): boolean {
  return (
    /\bTRANS\b/i.test(text) ||
    /\dCAL\b/i.test(text) ||
    /\b10\s*-\s*22\b/i.test(text) ||
    /\b7\s+SEVEN\b/i.test(text) ||
    /\bCIRCUT\b/i.test(text) ||
    /\b(?:SEMI|BOLT|LEVER|PUMP|SINGLE|DOUBLE)\b/i.test(text)
  );
}

/** Last-resort strip when full title parse cannot run. */
function stripAuctionJunk(text: string): string {
  return text
    .replace(/\bTRANS\b[\s:,#-]*[\d]+(?:\s*[,/]\s*[\d]+)*/gi, " ")
    .replace(/\bCIRCUT\b/gi, "Circuit")
    .replace(/\b(?:SEMI-?AUTOMATIC|SEMI-?AUTO|SEMI|BOLT(?:\s*ACTION)?|LEVER(?:\s*ACTION)?|PUMP(?:\s*ACTION)?|SINGLE|DOUBLE)\b/gi, " ")
    .replace(/\b(\d{2,3})CAL\.?/gi, " ")
    .replace(/\b(\d+\.\d+)\s*[xX]\s*(\d+)\s*CAL\.?/gi, " ")
    .replace(/\b10\s*-\s*22\b/gi, "10/22")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Re-parse auction lotTitle when identity fields still look like house-export
 * titles. Returns a shallow copy with cleaned manufacturer / model / caliber.
 */
export function sanitizeBatchRowIdentity<T extends BatchIdentityFields>(row: T): T {
  const title = (row.lotTitle || "").trim();
  const combined = `${row.manufacturer} ${row.model} ${row.caliber ?? ""}`.trim();
  const blob = title || combined;
  if (!blob || !auctionTitleLooksDirty(`${title} ${combined}`)) {
    return row;
  }

  try {
    const parsed = titleParse.parseTitleBlob(blob);
    if (parsed.manufacturer.trim() && parsed.model.trim()) {
      const category = ["handgun", "rifle", "shotgun"].includes(parsed.category)
        ? parsed.category
        : row.category && ["handgun", "rifle", "shotgun"].includes(row.category)
          ? row.category
          : parsed.category || row.category;

      return {
        ...row,
        manufacturer: parsed.manufacturer,
        model: parsed.model,
        caliber: parsed.caliber || row.caliber,
        category,
      };
    }
  } catch {
    /* fall through to field strip */
  }

  const manufacturer = stripAuctionJunk(row.manufacturer) || row.manufacturer;
  const model = stripAuctionJunk(row.model) || row.model;
  return {
    ...row,
    manufacturer,
    model,
    caliber: row.caliber,
  };
}
