/** Distributors included in wholesale cross-reference grids and dealer-mode source pickers. */

export const TRACKED_VENDORS = [
  "lipseys",
  "zanders",
  "davidsons",
  "chattanooga",
  "2ndamendmentwholesale",
] as const;

export type TrackedVendor = (typeof TRACKED_VENDORS)[number];

export const VENDOR_LABELS: Record<TrackedVendor, string> = {
  lipseys: "Lipsey's",
  zanders: "Zanders",
  davidsons: "Davidson's",
  chattanooga: "Chattanooga",
  "2ndamendmentwholesale": "2nd Amendment Wholesale",
};

/**
 * Vendors that support automated catalog sync (API feed, Lipsey's Integration
 * API, and/or Firecrawl portal scrape via Session Vault credentials).
 */
export const API_SYNC_VENDORS = TRACKED_VENDORS;

export type ApiSyncVendor = TrackedVendor;

export function vendorLabel(name: string): string {
  const key = name.toLowerCase() as TrackedVendor;
  return VENDOR_LABELS[key] ?? name;
}

export function isTrackedVendor(name: string): boolean {
  return TRACKED_VENDORS.includes(name.toLowerCase() as TrackedVendor);
}
