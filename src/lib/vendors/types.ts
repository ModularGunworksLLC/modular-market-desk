import type { ImportResult } from "@/lib/csv/importer";
import type { TrackedVendor } from "@/lib/tracked-vendors";

/** Unified product row before UPSERT into catalog_items. */
export interface CatalogRow {
  sku: string | null;
  upc: string | null;
  manufacturer: string;
  model: string;
  description: string | null;
  caliber: string | null;
  category: string | null;
  dealerPrice: number;
  msrp: number | null;
  mapPrice: number | null;
  salePrice: number | null;
  onSale: boolean;
  qty: number | null;
}

export type VendorSyncMode = "feed" | "lipseys_api" | "firecrawl_portal";

export interface VendorSyncConfig {
  vendor: TrackedVendor;
  mode: VendorSyncMode;
  /** Default dealer portal / inventory page when vault meta.catalogUrl is empty. */
  defaultCatalogUrl?: string;
  /** Default CSV/API feed URL template; `{token}` is substituted when present. */
  defaultFeedUrl?: string;
  /** Firecrawl persistent browser profile name (optional login reuse). */
  firecrawlProfile?: string;
}

export interface VendorSyncResult extends ImportResult {
  mode: VendorSyncMode;
  markedOutOfStock: number;
  source: string;
}

export class VendorSyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VendorSyncError";
  }
}
