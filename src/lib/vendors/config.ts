import type { TrackedVendor } from "@/lib/tracked-vendors";
import { TRACKED_VENDORS } from "@/lib/tracked-vendors";

import type { VendorSyncConfig } from "./types";

/**
 * How each tracked distributor is synced.
 * - lipseys_api: official CatalogFeed (account-permissioned firearms/NFA)
 * - feed: CSV/TSV URL (2AW and any vault feedUrl override)
 * - firecrawl_portal: session-cookie scrape → CSV download or structured extract
 *
 * defaultCatalogUrl values are the dealer portals the account logs into.
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
    defaultCatalogUrl: "https://shop2.gzanders.com/",
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
    defaultCatalogUrl: "https://chattanoogashooting.com/",
    firecrawlProfile: "chattanooga-dealer",
  },
  "2ndamendmentwholesale": {
    vendor: "2ndamendmentwholesale",
    mode: "feed",
    defaultCatalogUrl: "https://www.2ndamendmentwholesale.com/",
    firecrawlProfile: "2aw-dealer",
  },
  orion: {
    vendor: "orion",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://orionfflsales.com/",
    firecrawlProfile: "orion-dealer",
  },
  rsr: {
    vendor: "rsr",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.rsrgroup.com/become-a-dealer",
    firecrawlProfile: "rsr-dealer",
  },
  shootingwarehouse: {
    vendor: "shootingwarehouse",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.theshootingwarehouse.com/tsw-home",
    firecrawlProfile: "shootingwarehouse-dealer",
  },
  pawholesale: {
    vendor: "pawholesale",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.pawholesale.com/",
    firecrawlProfile: "pawholesale-dealer",
  },
  bearcreekarsenal: {
    vendor: "bearcreekarsenal",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.bearcreekarsenal.com/",
    firecrawlProfile: "bearcreekarsenal-dealer",
  },
  palmettostatearmory: {
    vendor: "palmettostatearmory",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://dealer.palmettostatearmory.com/",
    firecrawlProfile: "psa-dealer",
  },
  dpms: {
    vendor: "dpms",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://dpmsinc.com/",
    firecrawlProfile: "dpms-dealer",
  },
  lakeline: {
    vendor: "lakeline",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://lakelinellc.com/",
    firecrawlProfile: "lakeline-dealer",
  },
  righttobear: {
    vendor: "righttobear",
    mode: "firecrawl_portal",
    defaultCatalogUrl: "https://www.righttobear.com/",
    firecrawlProfile: "righttobear-dealer",
  },
};

export const SYNCABLE_VENDORS: TrackedVendor[] = [...TRACKED_VENDORS];

export function getVendorSyncConfig(vendor: string): VendorSyncConfig | null {
  const key = vendor.trim().toLowerCase() as TrackedVendor;
  return VENDOR_SYNC_CONFIG[key] ?? null;
}
