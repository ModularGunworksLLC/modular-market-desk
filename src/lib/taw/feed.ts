/**
 * 2nd Amendment Wholesale catalog feed sync.
 * Delegates to the shared vendor feed syncer (CSV URL + vault token).
 */

import "server-only";

import { syncVendorFeed } from "@/lib/vendors/feed";
import { VendorSyncError } from "@/lib/vendors/types";
import type { ImportResult } from "@/lib/csv/importer";

/** @deprecated Prefer VendorSyncError from @/lib/vendors/types */
export class TawFeedError extends VendorSyncError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = "TawFeedError";
  }
}

export async function syncTawCatalog(): Promise<ImportResult> {
  try {
    const result = await syncVendorFeed("2ndamendmentwholesale");
    return {
      vendorName: result.vendorName,
      parsed: result.parsed,
      upserted: result.upserted,
      skipped: result.skipped,
    };
  } catch (err) {
    if (err instanceof VendorSyncError) {
      throw new TawFeedError(err.message, err.status);
    }
    throw err;
  }
}
