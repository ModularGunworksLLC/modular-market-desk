import type { TrackedVendor } from "@/lib/tracked-vendors";
import { TRACKED_VENDORS } from "@/lib/tracked-vendors";

import type { VendorSyncConfig } from "./types";

/**
 * How each tracked distributor is synced.
 * - lipseys_api: official CatalogFeed (account-permissioned firearms/NFA)
 * - feed: CSV/TSV URL (2AW and any vault feedUrl override)
 * - firecrawl_portal: session-cookie scrape → CSV download or structured extract
 */
export const VENDOR_SYNC_CONFIG: Record<TrackedVendor, VendorSyncConfig> = {
  lipseys: {
    vendor: "lipseys",
    mode: "lipseys_api",
    defaultCatalogUrl: "https://www.lipseys.com/",
    defaultFeedUrl: "https://api.lipseys.com/api/Integration/Items/CatalogFeed",
    firecrawlProfile: "lipseys-dealer",
  },
  zanders: {
    vendor: "zanders",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.gzanders.com/",
    firecrawlProfile: "zanders-dealer",
  },
  davidsons: {
    vendor: "davidsons",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.davidsonsinc.com/",
    firecrawlProfile: "davidsons-dealer",
  },
  chattanooga: {
    vendor: "chattanooga",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.chattanoogashooting.com/",
    firecrawlProfile: "chattanooga-dealer",
  },
  "2ndamendmentwholesale": {
    vendor: "2ndamendmentwholesale",
    mode: "feed",
    firecrawlProfile: "2aw-dealer",
  },
};

export const SYNCABLE_VENDORS: TrackedVendor[] = [...TRACKED_VENDORS];

export function getVendorSyncConfig(vendor: string): VendorSyncConfig | null {
  const key = vendor.trim().toLowerCase() as TrackedVendor;
  return VENDOR_SYNC_CONFIG[key] ?? null;
}
