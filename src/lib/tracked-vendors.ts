/** Distributors included in wholesale cross-reference grids and dealer-mode source pickers. */

export const TRACKED_VENDORS = [
  "lipseys",
  "zanders",
  "davidsons",
  "chattanooga",
  "2ndamendmentwholesale",
  "orion",
  "rsr",
  "shootingwarehouse",
  "pawholesale",
  "bearcreekarsenal",
  "palmettostatearmory",
  "dpms",
  "lakeline",
  "righttobear",
] as const;

export type TrackedVendor = (typeof TRACKED_VENDORS)[number];

export const VENDOR_LABELS: Record<TrackedVendor, string> = {
  lipseys: "Lipsey's",
  zanders: "Zanders",
  davidsons: "Davidson's",
  chattanooga: "Chattanooga",
  "2ndamendmentwholesale": "2nd Amendment Wholesale",
  orion: "Orion FFL Sales",
  rsr: "RSR Group",
  shootingwarehouse: "The Shooting Warehouse",
  pawholesale: "PA Wholesale",
  bearcreekarsenal: "Bear Creek Arsenal",
  palmettostatearmory: "Palmetto State Armory",
  dpms: "DPMS",
  lakeline: "Lake Line LLC",
  righttobear: "Right to Bear",
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
